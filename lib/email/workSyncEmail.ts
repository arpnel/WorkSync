import { createHash } from "node:crypto";

export type EmailEventKind =
  | "job_application_received"
  | "job_application_decision"
  | "project_work_submitted"
  | "project_work_reviewed"
  | "payment_confirmed";

export interface WorkSyncEmailContent {
  kind: EmailEventKind;
  eventId: string;
  recipientEmail: string;
  recipientName?: string | null;
  subject: string;
  heading: string;
  message: string;
  actionLabel: string;
  actionUrl: string;
}

export interface BrevoEmailPayload {
  sender: { email: string; name: string };
  to: Array<{ email: string; name?: string }>;
  subject: string;
  htmlContent: string;
  textContent: string;
  headers: { "Idempotency-Key": string };
  tags: string[];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]!,
  );
}

export function emailIdempotencyKey(eventId: string): string {
  const bytes = createHash("sha256").update(eventId).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createBrevoEmailPayload(
  content: WorkSyncEmailContent,
  sender: { email: string; name: string },
): BrevoEmailPayload {
  const name = content.recipientName?.trim();
  const greeting = name ? `Hi ${name},` : "Hello,";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(content.subject)}</title></head><body style="margin:0;background:#f3f5f4;font-family:Arial,Helvetica,sans-serif;color:#202a25"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f4;padding:28px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #e3e9e5;border-radius:16px;overflow:hidden"><tr><td style="background:#16834a;padding:20px 28px;color:#fff;font-size:18px;font-weight:700">WorkSync</td></tr><tr><td style="padding:32px 28px"><p style="margin:0 0 18px;font-size:15px">${escapeHtml(greeting)}</p><h1 style="margin:0 0 14px;font-size:24px;line-height:1.3;color:#17231c">${escapeHtml(content.heading)}</h1><p style="margin:0 0 26px;font-size:16px;line-height:1.65;color:#4a5750">${escapeHtml(content.message)}</p><p style="margin:0 0 28px"><a href="${escapeHtml(content.actionUrl)}" style="display:inline-block;background:#16834a;color:#fff;text-decoration:none;padding:13px 20px;border-radius:8px;font-size:15px;font-weight:700">${escapeHtml(content.actionLabel)}</a></p><p style="margin:0;font-size:13px;line-height:1.6;color:#66736b">If the button does not work, copy this link into your browser:<br><a href="${escapeHtml(content.actionUrl)}" style="color:#16834a;word-break:break-all">${escapeHtml(content.actionUrl)}</a></p></td></tr><tr><td style="padding:18px 28px;background:#f8faf8;border-top:1px solid #e9eeeb;color:#78837c;font-size:12px;line-height:1.5">You received this service email because of activity on your WorkSync account. Please do not reply with passwords or payment credentials.</td></tr></table></td></tr></table></body></html>`;
  const textContent = `${greeting}\n\n${content.heading}\n\n${content.message}\n\n${content.actionLabel}: ${content.actionUrl}\n\nYou received this service email because of activity on your WorkSync account.`;
  return {
    sender,
    to: [{ email: content.recipientEmail, ...(name ? { name } : {}) }],
    subject: content.subject,
    htmlContent: html,
    textContent,
    headers: { "Idempotency-Key": emailIdempotencyKey(content.eventId) },
    tags: [`worksync_${content.kind}`],
  };
}
