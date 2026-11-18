import "server-only";
import { getSettings, SETTING_KEYS } from "@/lib/settings";

/**
 * The strip above the header.
 *
 * Config is resolved on the server so the copy is in the HTML from the first
 * paint - an announcement that flickers in after hydration is worse than none,
 * because it shoves the page down just as someone starts reading.
 */

export type AnnouncementConfig = {
  enabled: boolean;
  /** One line each; the bar cycles through them. */
  messages: string[];
  eyebrow: string;
  coupon: string;
  linkUrl: string;
  linkLabel: string;
  style: "highlight" | "dark" | "custom";
  bg: string;
  fg: string;
  /** ISO instant the offer ends, for the countdown. Empty means no countdown. */
  endsAt: string;
  dismissible: boolean;
  hideDays: number;
  rotateSeconds: number;
  layout: "rotate" | "strip";
  sticky: boolean;
};

const num = (v: string | undefined, fallback: number, min: number, max: number) => {
  const n = Number.parseInt(v ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/** Only hex is allowed through to the style attribute. */
function safeColour(value: string | undefined): string {
  const v = (value ?? "").trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : "";
}

/**
 * Relative paths and http(s) only - the same rule the Markdown helper uses.
 * Without it a saved setting could put javascript: behind the call to action.
 */
export function safeHref(value: string | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  return /^https?:\/\//i.test(v) ? v : "";
}

export async function getAnnouncementConfig(): Promise<AnnouncementConfig> {
  const s = await getSettings();

  const messages = (s[SETTING_KEYS.announceMessages] ?? "")
    .split("\n")
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(0, 5);

  const style = (["highlight", "dark", "custom"] as const).includes(
    s[SETTING_KEYS.announceStyle] as never,
  )
    ? (s[SETTING_KEYS.announceStyle] as AnnouncementConfig["style"])
    : "highlight";

  return {
    // No messages means nothing to say, so the bar stays down even if the
    // switch is on - an empty coloured strip just steals space.
    enabled: s[SETTING_KEYS.announceEnabled] === "1" && messages.length > 0,
    messages,
    eyebrow: (s[SETTING_KEYS.announceEyebrow] ?? "").trim(),
    coupon: (s[SETTING_KEYS.announceCoupon] ?? "").trim().toUpperCase(),
    linkUrl: safeHref(s[SETTING_KEYS.announceLinkUrl]),
    linkLabel: (s[SETTING_KEYS.announceLinkLabel] ?? "").trim(),
    style,
    bg: safeColour(s[SETTING_KEYS.announceBg]),
    fg: safeColour(s[SETTING_KEYS.announceFg]),
    endsAt: (s[SETTING_KEYS.announceEndsAt] ?? "").trim(),
    dismissible: (s[SETTING_KEYS.announceDismissible] ?? "1") === "1",
    hideDays: num(s[SETTING_KEYS.announceHideDays], 1, 0, 365),
    rotateSeconds: num(s[SETTING_KEYS.announceRotateSeconds], 6, 3, 60),
    layout: s[SETTING_KEYS.announceLayout] === "strip" ? "strip" : "rotate",
    sticky: (s[SETTING_KEYS.announceSticky] ?? "1") === "1",
  };
}
