import { CHAT_FILE_MAX_BYTES, saveChatImage } from "@/lib/chat-files";

export const dynamic = "force-dynamic";

/*
 * Customer image upload for the chat widget (attach button or pasted
 * screenshot). The file is stored but belongs to nobody until a message
 * references it, and nobody can view it until then - /api/chat/file only
 * serves files attached to a conversation the viewer may read.
 *
 * A small per-address budget stops the endpoint being used as free storage.
 */
const WINDOW_MS = 10 * 60_000;
const PER_WINDOW = 20;
const KEY = Symbol.for("shop.chatUploadBudget");

function allowed(ip: string): boolean {
  const g = globalThis as unknown as Record<symbol, Map<string, number[]> | undefined>;
  const map: Map<string, number[]> = (g[KEY] ??= new Map<string, number[]>());
  const now = Date.now();
  const recent = (map.get(ip) ?? []).filter((t: number) => now - t < WINDOW_MS);
  if (recent.length >= PER_WINDOW) {
    map.set(ip, recent);
    return false;
  }
  recent.push(now);
  map.set(ip, recent);
  if (map.size > 5000) map.clear();
  return true;
}

export async function POST(request: Request): Promise<Response> {
  const ip =
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  if (!allowed(ip)) {
    return Response.json({ error: "Too many images - try again in a few minutes." }, { status: 429 });
  }

  let file: FormDataEntryValue | null = null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return Response.json({ error: "No image received." }, { status: 400 });
  }
  if (!file || typeof file === "string") {
    return Response.json({ error: "No image received." }, { status: 400 });
  }
  if (file.size > CHAT_FILE_MAX_BYTES) {
    return Response.json({ error: "Images must be under 5 MB." }, { status: 413 });
  }

  const name = await saveChatImage(Buffer.from(await file.arrayBuffer()));
  if (!name) {
    return Response.json({ error: "Only PNG, JPG, GIF or WebP images can be sent." }, { status: 415 });
  }
  return Response.json({ name }, { headers: { "Cache-Control": "no-store" } });
}
