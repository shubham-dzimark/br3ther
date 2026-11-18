"use server";

import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/permissions";
import {
  ThemeError,
  deleteFile,
  requestPublish,
  restoreRevision,
  safeName,
  saveCode,
  type ThemeRoot,
} from "@/lib/theme-editor";

const PAGE = "/admin/content/theme";

/**
 * Editing theme code is editing the shop's source, so it is Master-only even
 * though the page sits under Content.
 */
async function owner() {
  const me = await requireCapability("settings");
  if (me.role !== "OWNER") redirect(`${PAGE}?error=${encodeURIComponent("Only a Master can edit the theme.")}`);
  return me;
}

function fail(e: unknown, back: string): never {
  const msg = e instanceof ThemeError ? e.message : "Something went wrong.";
  if (!(e instanceof ThemeError)) console.error("[theme-editor]", e);
  redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);
}

function root(v: FormDataEntryValue | null): ThemeRoot {
  return v === "images" ? "images" : "code";
}

/** Called straight from the editor so a save does not reload the page. */
export async function saveThemeFile(
  name: string,
  content: string,
  expectModified: number,
): Promise<{ ok: true; modified: number } | { ok: false; error: string }> {
  const me = await owner();
  try {
    const modified = await saveCode(name, content, me.email, { expectModified });
    return { ok: true, modified };
  } catch (e) {
    if (!(e instanceof ThemeError)) console.error("[theme-editor]", e);
    return { ok: false, error: e instanceof ThemeError ? e.message : "Could not save the file." };
  }
}

export async function createThemeFile(fd: FormData): Promise<void> {
  const me = await owner();
  const name = String(fd.get("name") ?? "");
  try {
    const clean = safeName("code", name);
    const starter = clean.endsWith(".css")
      ? "/* New stylesheet. Import it from a component to use it. */\n"
      : `export function ${clean.replace(/\.tsx?$/, "").replace(/[^A-Za-z0-9]/g, "") || "Component"}() {\n  return <div className="gf"></div>;\n}\n`;
    await saveCode(clean, starter, me.email, { create: true });
    redirect(`${PAGE}?file=${encodeURIComponent(clean)}&saved=created`);
  } catch (e) {
    if (e instanceof ThemeError) fail(e, PAGE);
    throw e;
  }
}

export async function deleteThemeFile(fd: FormData): Promise<void> {
  const me = await owner();
  const r = root(fd.get("root"));
  const name = String(fd.get("name") ?? "");
  const back = r === "images" ? `${PAGE}?tab=images` : PAGE;
  try {
    await deleteFile(r, name, me.email);
  } catch (e) {
    fail(e, back);
  }
  redirect(`${back}${back.includes("?") ? "&" : "?"}saved=deleted`);
}

export async function restoreThemeRevision(fd: FormData): Promise<void> {
  const me = await owner();
  const r = root(fd.get("root"));
  const name = String(fd.get("name") ?? "");
  const id = String(fd.get("id") ?? "");
  const back = r === "images" ? `${PAGE}?tab=images` : `${PAGE}?file=${encodeURIComponent(name)}`;
  try {
    await restoreRevision(r, name, id, me.email);
  } catch (e) {
    fail(e, back);
  }
  redirect(`${back}&saved=restored`);
}

export async function publishTheme(fd: FormData): Promise<void> {
  const me = await owner();
  const back = String(fd.get("back") ?? PAGE);
  const safeBack = back.startsWith(PAGE) ? back : PAGE;
  try {
    await requestPublish(me.email);
  } catch (e) {
    fail(e, safeBack);
  }
  redirect(safeBack);
}
