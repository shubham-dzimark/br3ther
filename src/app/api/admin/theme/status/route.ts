import { requireAdmin } from "@/lib/auth";
import { liveBuildTime, publishLog, publishStatus } from "@/lib/theme-editor";

export const dynamic = "force-dynamic";

/** Polled by the Publish panel while a rebuild runs. */
export async function GET(): Promise<Response> {
  const admin = await requireAdmin();
  if (admin.role !== "OWNER") return Response.json({ error: "Forbidden" }, { status: 403 });
  const [status, log, live] = await Promise.all([publishStatus(), publishLog(), liveBuildTime()]);
  return Response.json({ status, log, live }, { headers: { "Cache-Control": "no-store" } });
}
