import "server-only";
import { randomInt } from "node:crypto";
import { getSettings, SETTING_KEYS } from "@/lib/settings";

/**
 * Interac e-Transfer behaviour, ported from the vicetrip.st WooCommerce
 * gateway so this store behaves the same way.
 */

/** Ambiguous characters removed so answers can be read aloud over the phone. */
const ANSWER_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateSecurityAnswer(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ANSWER_ALPHABET[randomInt(ANSWER_ALPHABET.length)];
  }
  return out;
}

export type EmtConfig = {
  enabled: boolean;
  title: string;
  description: string;
  recipientEmail: string;
  recipientName: string;
  bankName: string;
  autoDeposit: boolean;
  useRandomAnswer: boolean;
  staticAnswer: string;
  securityQuestion: string;
  instructions: string;
  /** Positive = discount, negative = surcharge, 0 = off. */
  adjustPercent: number;
  adjustMessage: string;
  minOrderCents: number;
  maxOrderCents: number;
  autoCancelDays: number;
  debugLog: boolean;
};

export async function getEmtConfig(): Promise<EmtConfig> {
  const s = await getSettings();
  return {
    enabled: true,
    title: s[SETTING_KEYS.emtTitle] || "Email Money Transfer",
    description: s[SETTING_KEYS.emtDescription] || "",
    recipientEmail: s[SETTING_KEYS.emtRecipientEmail] || "",
    recipientName: s[SETTING_KEYS.emtRecipientName] || "",
    bankName: s[SETTING_KEYS.emtBankName] || "",
    autoDeposit: s[SETTING_KEYS.emtAutoDeposit] === "1",
    useRandomAnswer: s[SETTING_KEYS.emtUseRandomAnswer] === "1",
    staticAnswer: s[SETTING_KEYS.emtStaticAnswer] || "",
    securityQuestion: s[SETTING_KEYS.emtSecurityQuestion] || "",
    instructions: s[SETTING_KEYS.emtInstructions] || "",
    adjustPercent: Number(s[SETTING_KEYS.emtAdjustPercent]) || 0,
    adjustMessage: s[SETTING_KEYS.emtAdjustMessage] || "",
    minOrderCents: Number(s[SETTING_KEYS.emtMinOrderCents]) || 0,
    maxOrderCents: Number(s[SETTING_KEYS.emtMaxOrderCents]) || 0,
    autoCancelDays: Number(s[SETTING_KEYS.emtAutoCancelDays]) || 0,
    debugLog: s[SETTING_KEYS.emtDebugLog] === "1",
  };
}

/** The answer a given order should carry: random per order, or the static one. */
export function answerForOrder(config: EmtConfig): string | null {
  if (config.autoDeposit) return null; // auto-deposit needs no answer at all
  return config.useRandomAnswer
    ? generateSecurityAnswer()
    : config.staticAnswer || null;
}

/**
 * Discount (or surcharge) applied to the subtotal when EMT is chosen.
 * Positive percent reduces the total; negative adds to it.
 */
export function emtAdjustmentCents(
  subtotalCents: number,
  config: EmtConfig,
): number {
  if (!config.adjustPercent) return 0;
  return Math.round((subtotalCents * config.adjustPercent) / 100);
}

/** Whether EMT may be offered for this order size. */
export function emtAvailableFor(subtotalCents: number, config: EmtConfig): boolean {
  if (config.minOrderCents && subtotalCents < config.minOrderCents) return false;
  if (config.maxOrderCents && subtotalCents > config.maxOrderCents) return false;
  return true;
}

/** Default message when the merchant leaves the discount message blank. */
export function adjustmentMessage(config: EmtConfig): string {
  if (!config.adjustPercent) return "";
  if (config.adjustMessage) {
    return config.adjustMessage.replace(
      /\[discount\]/g,
      String(Math.abs(config.adjustPercent)),
    );
  }
  return config.adjustPercent > 0
    ? `Save ${config.adjustPercent}% when you pay with e-Transfer.`
    : `A ${Math.abs(config.adjustPercent)}% surcharge applies to e-Transfer payments.`;
}

/**
 * Fills the merchant's instruction template.
 * Placeholders match the vicetrip gateway: [email] [amount] [order] [answer].
 */
export function renderInstructions(
  template: string,
  vars: { email: string; amount: string; order: string; answer: string },
): string {
  return template
    .replace(/\[email\]/g, vars.email)
    .replace(/\[amount\]/g, vars.amount)
    .replace(/\[order\]/g, vars.order)
    .replace(/\[answer\]/g, vars.answer);
}
