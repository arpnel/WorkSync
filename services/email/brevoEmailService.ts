import "server-only";
import { createClient } from "@supabase/supabase-js";
import {
  createBrevoEmailPayload,
  type WorkSyncEmailContent,
} from "@/lib/email/workSyncEmail";

class BrevoConfigurationError extends Error {
  constructor(readonly missing: string[]) {
    super("Brevo email is not configured.");
  }
}

export function emailAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) {
    console.error("WorkSync email recipient lookup is not configured", {
      missing: [!key && "SUPABASE_SERVICE_ROLE_KEY", !url && "NEXT_PUBLIC_SUPABASE_URL"].filter(Boolean),
    });
    throw new Error("Email recipient lookup is not configured.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getTrustedUserEmail(userId: string) {
  const { data, error } = await emailAdminClient().auth.admin.getUserById(userId);
  if (error || !data.user?.email) {
    console.warn("WorkSync email recipient lookup failed", {
      reason: error ? "auth_admin_lookup_failed" : "recipient_email_unavailable",
      code: error?.code ?? null,
    });
    return null;
  }
  const first = data.user.user_metadata?.first_name;
  const last = data.user.user_metadata?.last_name;
  const name = [first, last].filter((part) => typeof part === "string").join(" ");
  return { email: data.user.email, name: name || null };
}

export async function sendWorkSyncEmail(content: WorkSyncEmailContent) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME;
  const missing = [
    !apiKey && "BREVO_API_KEY",
    !senderEmail && "BREVO_SENDER_EMAIL",
    !senderName && "BREVO_SENDER_NAME",
  ].filter((name): name is string => Boolean(name));
  if (missing.length) throw new BrevoConfigurationError(missing);

  const payload = createBrevoEmailPayload(content, {
    email: senderEmail!,
    name: senderName!,
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": apiKey!,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3500),
      });
    } catch {
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
      console.error("Brevo transactional email request failed", {
        kind: content.kind,
        status: "network",
      });
      throw new Error("Brevo could not accept the transactional email.");
    }
    const providerError = (await response.json().catch(() => null)) as
      | { code?: string; messageId?: string }
      | null;
    if (response.ok) {
      console.info("Brevo accepted transactional email", {
        kind: content.kind,
        messageId: providerError?.messageId ?? null,
      });
      return;
    }
    if (providerError?.code === "duplicate_parameter") return;
    if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      continue;
    }
    console.error("Brevo transactional email request failed", {
      kind: content.kind,
      status: response.status,
      code: providerError?.code ?? "unknown",
    });
    throw new Error("Brevo could not accept the transactional email.");
  }
}

export async function sendWorkSyncEmailSafely(content: WorkSyncEmailContent) {
  try {
    await sendWorkSyncEmail(content);
  } catch (error) {
    if (error instanceof BrevoConfigurationError) {
      console.error("WorkSync email is not configured", {
        kind: content.kind,
        missing: error.missing,
      });
    }
    // Provider and network failures are logged at the point where they are
    // classified, so this boundary can keep delivery best-effort without
    // duplicating details or allowing the business operation to fail.
  }
}
