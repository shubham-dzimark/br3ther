"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/permissions";
import { setSetting } from "@/lib/settings";
import { LAB_RESULTS_KEY, sanitizeLabResults } from "@/lib/lab-results-data";

const PAGE = "/admin/lab-results";

/** Saves the whole page - heading, results and FAQ - posted as one JSON field. */
export async function saveLabResults(fd: FormData): Promise<void> {
  await requireCapability("content");

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(String(fd.get("payload") ?? ""));
  } catch {
    redirect(`${PAGE}?error=1`);
  }

  await setSetting(LAB_RESULTS_KEY, JSON.stringify(sanitizeLabResults(parsed)));

  revalidatePath("/lab-results");
  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=1`);
}
