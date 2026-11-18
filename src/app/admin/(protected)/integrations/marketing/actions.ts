"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCapability } from "@/lib/permissions";
import { setSettings } from "@/lib/settings";
import { MARKETING_TOOLS } from "./tools";

export async function saveMarketingTools(fd: FormData): Promise<void> {
  await requireCapability("settings");

  const entries: Record<string, string> = {};
  for (const tool of MARKETING_TOOLS) {
    entries[`${tool.key}.enabled`] = fd.get(`${tool.key}.enabled`) === "on" ? "1" : "0";
    entries[`${tool.key}.id`] = String(fd.get(`${tool.key}.id`) ?? "").trim();
  }

  await setSettings(entries);
  revalidatePath("/admin/integrations/marketing");
  redirect("/admin/integrations/marketing?saved=1");
}
