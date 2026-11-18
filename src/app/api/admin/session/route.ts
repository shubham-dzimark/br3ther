import { destroySession, touchSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/*
 * The admin idle timer's server side (see AdminIdleGuard).
 *
 *   GET    - how long this session has left, without extending it
 *   POST   - the person is using the admin: restart the idle clock
 *   DELETE - sign out (the timer ran out, or "Sign out now")
 *
 * POST and DELETE need the session cookie, which is SameSite=Lax, so another
 * site cannot make a browser send them.
 */
const noStore = { "Cache-Control": "no-store" };

async function status(touch: boolean): Promise<Response> {
  const s = await touchSession({ touch });
  if (!s) return Response.json({ signedIn: false }, { status: 401, headers: noStore });
  return Response.json({ signedIn: true, ...s }, { headers: noStore });
}

export async function GET(): Promise<Response> {
  return status(false);
}

export async function POST(): Promise<Response> {
  return status(true);
}

export async function DELETE(): Promise<Response> {
  await destroySession();
  return Response.json({ signedIn: false }, { headers: noStore });
}
