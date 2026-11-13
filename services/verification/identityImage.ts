export const IDENTITY_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES = {
  jpg: { extension: "jpg", contentType: "image/jpeg" },
  jpeg: { extension: "jpg", contentType: "image/jpeg" },
  png: { extension: "png", contentType: "image/png" },
} as const;

export function identityImageFormat(fileName: string, mimeType: string) {
  const extension = fileName.split(".").at(-1)?.toLowerCase() ?? "";
  const format = IMAGE_TYPES[extension as keyof typeof IMAGE_TYPES];
  if (!format) throw new Error("Choose a JPG, JPEG, or PNG image.");
  if (format.contentType !== mimeType && !(extension !== "png" && mimeType === "image/jpg"))
    throw new Error("The image type does not match its file extension.");
  return format;
}

export function validateIdentityImage(
  fileName: string,
  mimeType: string,
  size: number,
) {
  if (!Number.isFinite(size) || size < 1 || size > IDENTITY_IMAGE_MAX_BYTES)
    throw new Error("Each image must be smaller than 5 MB.");
  return identityImageFormat(fileName, mimeType);
}
