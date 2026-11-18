import { requireAdmin } from "@/lib/auth";
import { IMAGE_MAX_BYTES, ThemeError, safeName, saveImage } from "@/lib/theme-editor";

export const dynamic = "force-dynamic";

/**
 * Upload or replace theme images (public/br3thr). A route rather than a
 * server action because actions cap the body at 1 MB and hero photos are larger.
 * Master only, like the rest of the theme editor.
 */
export async function POST(request: Request): Promise<Response> {
  const admin = await requireAdmin();
  if (admin.role !== "OWNER") return Response.json({ error: "Only a Master can edit the theme." }, { status: 403 });

  const fd = await request.formData();
  const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  // "replace" keeps the existing name, so every page using the image picks it up.
  const replace = String(fd.get("replace") ?? "");
  if (files.length === 0) return Response.json({ error: "Choose an image." }, { status: 400 });

  const saved: string[] = [];
  try {
    for (const file of replace ? files.slice(0, 1) : files) {
      if (file.size > IMAGE_MAX_BYTES) throw new ThemeError(`${file.name} is larger than 8 MB.`);
      const name = safeName("images", replace || file.name.replace(/\s+/g, "-"));
      await saveImage(name, Buffer.from(await file.arrayBuffer()), admin.email);
      saved.push(name);
    }
  } catch (e) {
    if (!(e instanceof ThemeError)) console.error("[theme-editor] upload", e);
    return Response.json({ error: e instanceof ThemeError ? e.message : "Upload failed.", saved }, { status: 400 });
  }
  return Response.json({ saved });
}
