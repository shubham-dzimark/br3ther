import "server-only";
import { cookies } from "next/headers";
import { getSettings, SETTING_KEYS } from "@/lib/settings";

/**
 * Age verification gate.
 *
 * Decided on the server, from a cookie, so the page never renders unguarded
 * for a frame before JavaScript hides it - which would defeat the point and
 * looks broken besides.
 */

export const AGE_COOKIE = "nl_age_ok";
export const AGE_DECLINED_COOKIE = "nl_age_no";

export type AgeGateConfig = {
  enabled: boolean;
  minAge: number;
  /** "confirm" is a yes/no button; "dob" asks for a date of birth. */
  mode: "confirm" | "dob";
  title: string;
  body: string;
  confirmLabel: string;
  declineLabel: string;
  declineUrl: string;
  declineMessage: string;
  rememberDays: number;
  image: string;
  footnote: string;
};

/** Copy is written with {age} so one setting drives every mention of it. */
function fill(text: string, age: number): string {
  return (text ?? "").replaceAll("{age}", String(age));
}

export async function getAgeGateConfig(): Promise<AgeGateConfig> {
  const s = await getSettings();
  const minAge = Math.min(99, Math.max(1, Number(s[SETTING_KEYS.ageGateMinAge]) || 18));

  return {
    enabled: s[SETTING_KEYS.ageGateEnabled] === "1",
    minAge,
    mode: s[SETTING_KEYS.ageGateMode] === "dob" ? "dob" : "confirm",
    title: fill(s[SETTING_KEYS.ageGateTitle] || "Are you {age} or older?", minAge),
    body: fill(s[SETTING_KEYS.ageGateBody] ?? "", minAge),
    confirmLabel: fill(s[SETTING_KEYS.ageGateConfirmLabel] || "Yes", minAge),
    declineLabel: fill(s[SETTING_KEYS.ageGateDeclineLabel] || "No", minAge),
    declineUrl: (s[SETTING_KEYS.ageGateDeclineUrl] ?? "").trim(),
    declineMessage: fill(s[SETTING_KEYS.ageGateDeclineMessage] ?? "", minAge),
    rememberDays: Math.min(365, Math.max(0, Number(s[SETTING_KEYS.ageGateRememberDays]) || 30)),
    image: (s[SETTING_KEYS.ageGateImage] ?? "").trim(),
    footnote: fill(s[SETTING_KEYS.ageGateFootnote] ?? "", minAge),
  };
}

export type AgeGateState = "pass" | "ask" | "blocked";

/**
 * Whether this visitor may see the shop.
 *
 * The cookie records the age that was confirmed, not just "yes" - so raising
 * the minimum age in settings re-asks everyone who only cleared the old one,
 * instead of grandfathering them in.
 */
export async function ageGateState(config?: AgeGateConfig): Promise<AgeGateState> {
  const c = config ?? (await getAgeGateConfig());
  if (!c.enabled) return "pass";

  const jar = await cookies();
  if (jar.get(AGE_DECLINED_COOKIE)?.value === "1") return "blocked";

  const passed = Number(jar.get(AGE_COOKIE)?.value ?? "");
  return Number.isFinite(passed) && passed >= c.minAge ? "pass" : "ask";
}
