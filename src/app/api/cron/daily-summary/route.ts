import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { bangkokDateOf, previousBangkokDate } from "@/lib/daily-summary";
import { computeDailySummary, sendDailySummary } from "@/lib/daily-summary-job";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // no secret configured → the endpoint is closed
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Vercel Cron (vercel.json: 17:05 UTC = 00:05 Bangkok) calls this with `Authorization: Bearer $CRON_SECRET`.
 * It summarises the PREVIOUS Bangkok day. Optional: ?date=YYYY-MM-DD (a past day) and ?dryRun=1 (compute and return the figures,
 * send nothing and mark nothing) for checking by hand. Duplicate protection lives in the database (claim_daily_summary, migration 0018).
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const now = new Date();
  const dateParam = url.searchParams.get("date");
  let date = previousBangkokDate(now);
  if (dateParam) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam) || dateParam >= bangkokDateOf(now)) {
      return NextResponse.json({ error: "date must be a past Bangkok date (YYYY-MM-DD)" }, { status: 400 });
    }
    date = dateParam;
  }

  if (url.searchParams.get("dryRun") === "1") {
    try {
      return NextResponse.json({ dryRun: true, summary: await computeDailySummary(date) });
    } catch (e) {
      console.error("daily summary dry run failed", e);
      return NextResponse.json({ error: "compute_failed" }, { status: 500 });
    }
  }

  const out = await sendDailySummary(date);
  return NextResponse.json({ date, ...out }, { status: out.status === "failed" ? 500 : 200 });
}
