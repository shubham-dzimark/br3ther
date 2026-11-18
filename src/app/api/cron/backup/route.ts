import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/secret-compare";
import { backupDue, createBackup } from "@/lib/backup";
import { getSettings, SETTING_KEYS } from "@/lib/settings";

export const dynamic = "force-dynamic";
// A dump plus a 22MB tar takes longer than the default budget.
export const maxDuration = 300;

/**
 * Nightly backup. Same secret-header contract as the other cron endpoints, so
 * one crontab line can drive all of them.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!secretMatches(provided, secret)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const settings = await getSettings();
  if (settings[SETTING_KEYS.backupEnabled] === "0") {
    return NextResponse.json({ skipped: "backups are switched off" });
  }

  /*
   * Cron ticks often; the schedule decides. `?force=1` bypasses it so the
   * endpoint can still be run on demand with the same secret.
   */
  const force = new URL(request.url).searchParams.get("force") === "1";
  if (!force) {
    const check = await backupDue(settings[SETTING_KEYS.backupTime] ?? "03:17");
    if (!check.due) return NextResponse.json({ skipped: check.reason });
  }

  try {
    const file = await createBackup({
      keep: Number(settings[SETTING_KEYS.backupKeep]) || 1,
      includeEnv: settings[SETTING_KEYS.backupIncludeEnv] === "1",
    });
    return NextResponse.json({
      ok: true,
      name: file.name,
      sizeBytes: file.sizeBytes,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "backup failed" },
      { status: 500 },
    );
  }
}
