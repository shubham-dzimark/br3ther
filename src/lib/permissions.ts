import "server-only";
import { redirect } from "next/navigation";
import { requireAdmin, type SessionUser } from "@/lib/auth";
import {
  CAPABILITIES,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  capabilitiesFor,
  can,
  landingFor,
  type Capability,
} from "@/lib/capabilities";

// Re-exported so every existing import of this module keeps working.
export {
  CAPABILITIES,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  capabilitiesFor,
  can,
  landingFor,
};
export type { Capability };

export async function requireCapability(
  capability: Capability,
): Promise<SessionUser> {
  const user = await requireAdmin();
  if (!can(user.role, capability)) {
    /*
     * Never redirect to a fixed page here. The destination has to be one this
     * particular role can open, otherwise refusing access to one page throws
     * the user into a loop between two pages that both refuse them.
     */
    const to = landingFor(user.role);
    redirect(`${to}${to.includes("?") ? "&" : "?"}denied=${capability}`);
  }
  return user;
}
