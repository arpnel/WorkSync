export const TAX_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;

export type TaxDocumentFormat = { extension: "pdf" | "jpg" | "png"; contentType: "application/pdf" | "image/jpeg" | "image/png" };

const FORMATS: Record<string, TaxDocumentFormat> = {
  pdf: { extension: "pdf", contentType: "application/pdf" },
  jpg: { extension: "jpg", contentType: "image/jpeg" },
  jpeg: { extension: "jpg", contentType: "image/jpeg" },
  png: { extension: "png", contentType: "image/png" },
};

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function containsAscii(bytes: Uint8Array, value: string) {
  outer: for (let index = 0; index <= bytes.length - value.length; index++) {
    for (let offset = 0; offset < value.length; offset++) if (bytes[index + offset] !== value.charCodeAt(offset)) continue outer;
    return true;
  }
  return false;
}

function validPng(bytes: Uint8Array) {
  if (bytes.length < 57 || bytes[0] !== 0x89 || ascii(bytes, 1, 4) !== "PNG" || ascii(bytes, 4, 8) !== "\r\n\u001a\n") return false;
  let offset = 8;
  let hasHeader = false;
  let hasImageData = false;
  let hasEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) return false;
    const kind = ascii(bytes, offset + 4, offset + 8);
    let crc = 0xffffffff;
    for (let index = offset + 4; index < offset + 8 + length; index++) {
      crc ^= bytes[index];
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    const expected = bytes[offset + 8 + length] * 0x1000000 + (bytes[offset + 9 + length] << 16) + (bytes[offset + 10 + length] << 8) + bytes[offset + 11 + length];
    if (((crc ^ 0xffffffff) >>> 0) !== expected) return false;
    if (!hasHeader) {
      if (kind !== "IHDR" || length !== 13) return false;
      const width = bytes[offset + 8] * 0x1000000 + (bytes[offset + 9] << 16) + (bytes[offset + 10] << 8) + bytes[offset + 11];
      const height = bytes[offset + 12] * 0x1000000 + (bytes[offset + 13] << 16) + (bytes[offset + 14] << 8) + bytes[offset + 15];
      if (!width || !height) return false;
      hasHeader = true;
    } else if (kind === "IDAT" && length > 0) hasImageData = true;
    else if (kind === "IEND") {
      if (length !== 0 || chunkEnd !== bytes.length) return false;
      hasEnd = true;
      break;
    }
    offset = chunkEnd;
  }
  return hasHeader && hasImageData && hasEnd;
}

function validJpeg(bytes: Uint8Array) {
  if (bytes.length < 16 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return false;
  let offset = 2;
  let hasFrame = false;
  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda) return hasFrame && offset + 2 <= bytes.length && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x00) return false;
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (offset + 2 > bytes.length) return false;
    const length = (bytes[offset] << 8) + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return false;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) hasFrame = true;
    offset += length;
  }
  return false;
}

function validPdf(bytes: Uint8Array) {
  if (bytes.length < 32 || !ascii(bytes, 0, 5).startsWith("%PDF-")) return false;
  const tailStart = Math.max(0, bytes.length - 2048);
  const tail = ascii(bytes, tailStart, bytes.length);
  const start = tail.match(/startxref\s+(\d+)\s+%%EOF\s*$/);
  if (!start || !containsAscii(bytes, " obj") || !containsAscii(bytes, "endobj") || !containsAscii(bytes, "trailer")) return false;
  const xrefOffset = Number(start[1]);
  if (!Number.isSafeInteger(xrefOffset) || xrefOffset < 5 || xrefOffset >= bytes.length) return false;
  return ascii(bytes, xrefOffset, Math.min(bytes.length, xrefOffset + 4)) === "xref"
    || containsAscii(bytes.subarray(xrefOffset, Math.min(bytes.length, xrefOffset + 100)), "/XRef");
}

export function inspectTaxDocument(name: string, claimedMime: string, bytes: Uint8Array): TaxDocumentFormat {
  if (!bytes.byteLength) throw new Error("The selected file is empty.");
  if (bytes.byteLength > TAX_DOCUMENT_MAX_BYTES) throw new Error("Tax documents must be 5 MB or smaller.");
  const extension = name.split(".").at(-1)?.toLowerCase() ?? "";
  const format = FORMATS[extension];
  if (!format) throw new Error("Upload a PDF, JPG, or PNG file.");

  const validMime = claimedMime === format.contentType
    || (extension === "jpg" || extension === "jpeg") && claimedMime === "image/jpg";
  if (!validMime) throw new Error("The file type does not match its extension.");

  const isPng = validPng(bytes);
  const isJpeg = validJpeg(bytes);
  const isPdf = validPdf(bytes);

  if (!(extension === "pdf" ? isPdf : extension === "png" ? isPng : isJpeg)) {
    throw new Error("The file contents are invalid or do not match the selected format.");
  }
  return format;
}
