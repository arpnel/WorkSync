import { timingSafeEqual } from "node:crypto";
import { settleProjects } from "@/services/payments/settlementServer";
import { processDueProjectReviewEmails } from "@/services/email/projectReviewEmails";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.PROJECT_SETTLEMENT_ENABLED !== "true")
    return Response.json(
      { enabled: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    const settlement = await settleProjects();
    const reviewEmails = await processDueProjectReviewEmails(request.url);
    return Response.json({ settlement, reviewEmails }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Settlement processing unavailable." },
      { status: 503 },
    );
  }
}
