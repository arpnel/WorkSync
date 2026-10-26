import { timingSafeEqual } from "node:crypto";
import { processPremiumExpiryNotices } from "@/services/subscriptions/subscriptionExpiryNotifications";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await processPremiumExpiryNotices();
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Premium expiry reminders are unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
