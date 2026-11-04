export type WithdrawalReceiptRecord = {
  id: string;
  requestedNetAmount: number;
  grossAmount: number;
  withholdingAmount: number;
  status: string;
  requestedAt: string;
  paidAt: string | null;
};

const php = (amount: number) =>
  `PHP ${Number(amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function pdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function pdfTextWidth(value: string, size: number) {
  return Array.from(value).length * size * 0.52;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function createWithdrawalReceipt(record: WithdrawalReceiptRecord) {
  const commands = [
    "q /WMGS gs 0.08 0.43 0.36 rg BT /F2 48 Tf 0.866 0.5 -0.5 0.866 126 348 Tm (WorkSync) Tj ET Q",
  ];
  const put = (
    value: string,
    x: number,
    y: number,
    size = 10,
    bold = false,
    color = "0.16 0.20 0.25",
  ) => {
    commands.push(
      `BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${x} ${y} Td (${pdfText(value)}) Tj ET`,
    );
  };
  const putRight = (value: string, y: number, size = 10, bold = false) =>
    put(value, 558 - pdfTextWidth(value, size), y, size, bold);
  const line = (y: number) =>
    commands.push(`0.86 0.89 0.91 RG 54 ${y} m 558 ${y} l S`);
  const box = (x: number, y: number, width: number, height: number) =>
    commands.push(
      `q 0.97 0.99 0.98 rg 0.87 0.91 0.89 RG ${x} ${y} ${width} ${height} re B Q`,
    );

  put("WorkSync", 54, 750, 14, true, "0.10 0.20 0.34");
  putRight("WITHDRAWAL RECEIPT", 750, 14, true);
  line(728);

  box(54, 636, 504, 76);
  put("NET WITHDRAWAL", 72, 690, 9, true, "0.39 0.43 0.48");
  put(php(record.requestedNetAmount), 72, 665, 20, true, "0.08 0.11 0.16");
  put("Date: " + formatDate(record.requestedAt), 72, 647, 8, false, "0.39 0.43 0.48");

  put("WITHDRAWAL DETAILS", 54, 606, 10, true, "0.18 0.24 0.31");
  put("Withdrawal ID", 54, 581, 9, false, "0.34 0.39 0.44");
  putRight(record.id, 581, 8, true);
  line(565);
  put("Status", 54, 544, 9, false, "0.34 0.39 0.44");
  putRight(record.status.replaceAll("_", " ").toUpperCase(), 544, 9, true);
  line(528);
  if (record.paidAt) {
    put("Paid date", 54, 507, 9, false, "0.34 0.39 0.44");
    putRight(formatDate(record.paidAt), 507, 9, true);
    line(491);
  }

  put("WITHDRAWAL BREAKDOWN", 54, 464, 10, true, "0.18 0.24 0.31");
  put("Gross amount", 54, 437, 9, false, "0.34 0.39 0.44");
  putRight(php(record.grossAmount), 437, 9, true);
  line(421);
  put("Withholding", 54, 400, 9, false, "0.34 0.39 0.44");
  putRight(php(record.withholdingAmount), 400, 9, true);
  line(384);
  put("Net withdrawal", 54, 363, 10, true);
  putRight(php(record.requestedNetAmount), 363, 10, true);
  line(346);

  commands.push("0.84 0.88 0.91 RG [2 3] 0 d 54 82 m 558 82 l S [] 0 d");
  put("WorkSync system-generated withdrawal receipt.", 78, 62, 8, false, "0.39 0.43 0.48");

  const encoder = new TextEncoder();
  const stream = commands.join("\n") + "\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /ExtGState << /WMGS 6 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /ExtGState /ca 0.08 /CA 0.08 >>",
    `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

export function openWithdrawalReceipt(record: WithdrawalReceiptRecord) {
  const url = URL.createObjectURL(createWithdrawalReceipt(record));
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
