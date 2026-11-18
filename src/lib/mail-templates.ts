import "server-only";
import { parseHex, toHex } from "@/lib/colour";

/**
 * Email templates.
 *
 * Table-based HTML with inline styles, because that is still what Gmail,
 * Outlook and Apple Mail agree on - no flexbox, no grid, no <style> block,
 * no web fonts. Every message also carries a plain-text part, which is what
 * spam filters look for and what a watch or a screen reader reads.
 *
 * Colours and the logo follow the storefront's own settings - see brandMail().
 */

/*
 * Every colour below is a token that brandMail() fills in, so one set of
 * templates serves both storefront themes: the classic light email, or the
 * Br3thr black-and-gold one.
 */
const INK = "__NL_INK__";
const MUTED = "__NL_MUTED__";
const LINE = "__NL_LINE__";
const PAGE = "__NL_PAGE__";
const CARD = "__NL_CARD__";
const FOOT = "__NL_FOOT__";
const BTN = "__NL_BTN__";
const BTN_INK = "__NL_BTN_INK__";
const HEAD_FONT = "__NL_HEAD_FONT__";
const CARD_EDGE = "__NL_CARD_EDGE__";
const SCHEME = "__NL_SCHEME__";

export type MailLine = {
  name: string;
  variant?: string | null;
  quantity: number;
  lineTotal: string;
  /**
   * PNG of this item's barcode. A URL rather than an attachment or inline SVG:
   * mail clients refuse SVG, and an attachment would show as a paperclip.
   */
  barcodeUrl?: string | null;
};

export type OrderMailData = {
  /** PNG of the order number, printed under the items when switched on. */
  orderBarcodeUrl?: string | null;
  storeName: string;
  storeUrl: string;
  /**
   * Direct link to this order's receipt, carrying its capability token.
   *
   * Guests have no account, so "View your order" pointed them at a sign-in
   * wall. When present this is used instead.
   */
  receiptUrl?: string;
  orderLabel: string;
  orderDate: string;
  customerName: string;
  lines: MailLine[];
  subtotal: string;
  discount?: string | null;
  couponCode?: string | null;
  shipping: string;
  tax?: string | null;
  total: string;
  address: string[];
  /** Face value of gift cards bought on the order, when any. */
  giftCards?: string | null;
  /** What a gift card paid toward the order, when one did. */
  giftCardPaid?: string | null;
  /** Only gift cards: nothing ships, so no subtotal or shipping rows. */
  digitalOnly?: boolean;
  /** A next-order reward this order earned (Next Order Coupon campaigns). */
  nextOrderCoupon?: { code: string; offer: string; note: string } | null;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/*
 * Brand placeholders. Templates stay pure functions and write these tokens;
 * sendMail() swaps in the storefront's own colours and logo (brandMail) just
 * before a message goes out, so a change under Settings → Appearance reaches
 * every email without touching this file.
 */
const DARK = "__NL_MAIL_DARK__";
const PRIMARY = "__NL_MAIL_PRIMARY__";
const HIGHLIGHT = "__NL_MAIL_HIGHLIGHT__";
const SOFT = "__NL_SOFT__";
/** The storefront's holo foil. Clients that drop gradients keep the solid colour under it. */
const HOLO =
  "linear-gradient(90deg,#ffe14d 0%,#ff6fd8 30%,#b388ff 55%,#5ce1ff 80%,#ffe14d 100%)";
/** The soft pink/cyan glow the storefront's dark panels carry. */
const GLOW =
  "radial-gradient(circle at 0% 0%,rgba(255,60,172,0.32),rgba(255,60,172,0) 55%),radial-gradient(circle at 100% 100%,rgba(0,200,255,0.26),rgba(0,200,255,0) 55%)";

/** Store-level design for outgoing mail, read from settings by sendMail(). */
export type MailBrand = {
  dark: string;
  primary: string;
  highlight: string;
  /**
   * Absolute https URL of the store logo. PNG, JPEG or GIF only: mail clients
   * refuse SVG, and Outlook does not show WebP.
   */
  logoUrl: string | null;
  /** "br3thr": black page, gold accents, serif headings, the crest. */
  theme?: "classic" | "br3thr";
};

/* Token values per theme. Buttons in the classic email are the dark pill
   with white text; in the Br3thr one, gold with black text. */
const LIGHT_TOKENS: Record<string, string> = {
  __NL_INK__: "#1f2937",
  __NL_MUTED__: "#6b7280",
  __NL_LINE__: "#e5e7eb",
  __NL_PAGE__: "#f4f4f6",
  __NL_CARD__: "#ffffff",
  __NL_FOOT__: "#f7f7f8",
  __NL_SOFT__: "#f5f1ff",
  __NL_BTN__: DARK,
  __NL_BTN_INK__: "#ffffff",
  __NL_HEAD_FONT__: "inherit",
  __NL_CARD_EDGE__: "0",
  __NL_SCHEME__: "light",
};
const BR3THR_TOKENS: Record<string, string> = {
  __NL_INK__: "#f4efe6",
  __NL_MUTED__: "#a89d8b",
  __NL_LINE__: "#3a2e1a",
  __NL_PAGE__: "#000000",
  __NL_CARD__: "#0b0908",
  __NL_FOOT__: "#050403",
  __NL_SOFT__: "#1c150c",
  __NL_BTN__: "#d4ab5a",
  __NL_BTN_INK__: "#000000",
  __NL_HEAD_FONT__: "Georgia,'Times New Roman',serif",
  __NL_CARD_EDGE__: "1px solid #5b4521",
  __NL_SCHEME__: "dark",
};

const colourOr = (value: string | undefined, fallback: string) => {
  const rgb = parseHex(value ?? "");
  return rgb ? toHex(rgb) : fallback;
};

/**
 * Fill in the brand placeholders a template wrote. Anything unusable falls
 * back to the default palette or the text wordmark, so a bad setting can never
 * produce an email with a broken header.
 */
export function brandMail(html: string, brand: Partial<MailBrand>): string {
  const logo =
    brand.logoUrl &&
    /^https:\/\/[^\s"'<>]+\.(png|jpe?g|gif)(\?[^\s"'<>]*)?$/i.test(brand.logoUrl)
      ? brand.logoUrl
      : null;

  const gf = brand.theme === "br3thr";
  let out = html;
  // Theme tokens first: the classic button token resolves to DARK, filled next.
  for (const [token, value] of Object.entries(gf ? BR3THR_TOKENS : LIGHT_TOKENS)) {
    out = out.split(token).join(value);
  }
  out = out
    .replace(
      "<!--nl-tagline-->",
      gf
        ? `<p style="margin:14px 0 0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#d4ab5a;font-family:Georgia,'Times New Roman',serif;">&#9670;&nbsp; Live like a Br3thr &nbsp;&#9670;</p>`
        : "",
    )
    .split(DARK)
    .join(gf ? "#000000" : colourOr(brand.dark, "#0d0a1c"))
    .split(PRIMARY)
    .join(gf ? "#d4ab5a" : colourOr(brand.primary, "#7b2ff7"))
    .split(HIGHLIGHT)
    .join(gf ? "#d4ab5a" : colourOr(brand.highlight, "#ffc400"));

  if (logo) {
    out = out.replace(/<!--nl-logo-->([\s\S]*?)<!--\/nl-logo-->/g, (_m, inner: string) => {
      // The wordmark text was escaped when the template wrote it.
      const alt = inner.replace(/<[^>]*>/g, "").trim();
      // The crest is square, so it is drawn smaller than a wide wordmark.
      const w = gf ? 110 : 180;
      return `<img src="${esc(logo)}" alt="${alt}" width="${w}" style="display:block;width:${w}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />`;
    });
  }
  return out;
}

/**
 * Shared shell, in the storefront's design.
 *
 * Dark header carrying the logo, a brand rule, then a hero: a small capitals
 * eyebrow in the brand colour ("ORDER CONFIRMED"), a big heading and one
 * quiet line under it, so the point of the email is read before a word of
 * the body. The body sits on white; a help strip and the legal line close it.
 *
 * Still tables and inline styles throughout - Gmail, Outlook and Apple Mail
 * have never agreed on anything newer.
 */
function layout(opts: {
  storeName: string;
  storeUrl: string;
  heading: string;
  preheader: string;
  body: string;
  /** Small capitals above the heading, e.g. "ORDER CONFIRMED". */
  eyebrow?: string;
  /** One quiet line under the heading. */
  lede?: string;
}): string {
  const help = [
    { href: `${opts.storeUrl}/track-order`, label: "Track an order" },
    { href: `${opts.storeUrl}/contact`, label: "Contact us" },
    { href: `${opts.storeUrl}/account`, label: "My account" },
  ]
    .map(
      (l) =>
        `<a href="${esc(l.href)}" style="color:${INK};font-size:13px;font-weight:600;text-decoration:none;">${esc(l.label)}</a>`,
    )
    .join(`<span style="color:${MUTED};padding:0 12px;">&middot;</span>`);

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="${SCHEME}"><meta name="supported-color-schemes" content="${SCHEME}"></head>
<body style="margin:0;padding:0;background:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PAGE}" style="background:${PAGE};padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD}" style="max-width:600px;background:${CARD};border:${CARD_EDGE};border-radius:20px;overflow:hidden;font-family:'DM Sans',Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <tr><td align="center" bgcolor="${DARK}" style="background-color:${DARK};padding:28px 32px;">
      <a href="${esc(opts.storeUrl)}" style="text-decoration:none;"><!--nl-logo--><span style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">${esc(opts.storeName)}</span><!--/nl-logo--></a>
    </td></tr>
    <tr><td height="3" bgcolor="${PRIMARY}" style="height:3px;line-height:3px;font-size:0;background-color:${PRIMARY};">&nbsp;</td></tr>
    <tr><td style="padding:36px 32px 6px;">
      ${
        opts.eyebrow
          ? `<p style="margin:0 0 10px;font-size:11px;line-height:1;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${PRIMARY};">${esc(opts.eyebrow)}</p>`
          : ""
      }
      <h1 style="margin:0;font-size:28px;line-height:1.2;color:${INK};font-weight:800;letter-spacing:-0.3px;font-family:${HEAD_FONT};">${esc(opts.heading)}</h1>
      ${
        opts.lede
          ? `<p style="margin:10px 0 0;font-size:15px;line-height:1.5;color:${MUTED};">${esc(opts.lede)}</p>`
          : ""
      }
    </td></tr>
    <tr><td style="padding:18px 32px 34px;">
      ${opts.body}
    </td></tr>
    <tr><td align="center" bgcolor="${FOOT}" style="padding:18px 32px;background:${FOOT};border-top:1px solid ${LINE};">
      ${help}
    </td></tr>
    <tr><td style="padding:18px 32px 26px;">
      <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">
        You received this because you placed an order or signed up at
        <a href="${esc(opts.storeUrl)}" style="color:${INK};font-weight:600;text-decoration:none;">${esc(opts.storeName)}</a>.
      </p><!--nl-tagline-->
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

/** The house button: a black pill with white text, as on the storefront. */
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:26px auto 6px;"><tr>
    <td bgcolor="${BTN}" style="background-color:${BTN};border-radius:999px;">
      <a href="${esc(href)}" style="display:inline-block;padding:15px 34px;font-size:15px;font-weight:700;color:${BTN_INK};text-decoration:none;letter-spacing:0.1px;">${esc(label)}</a>
    </td></tr></table>`;
}

/**
 * Where the order is up to: three stops, the current one ringed in the brand
 * colour and the ones behind it filled in. Printed at the top of every order
 * email so the customer never has to work out which stage a message means.
 */
function stepsRow(active: 1 | 2 | 3): string {
  const stops = ["Order placed", "Payment", "Shipped"];
  const cells = stops
    .map((label, i) => {
      const n = (i + 1) as 1 | 2 | 3;
      const done = n < active;
      const now = n === active;
      const circle = done
        ? `<span style="display:inline-block;width:26px;height:26px;line-height:26px;border-radius:13px;background:${DARK};color:#ffffff;font-size:13px;font-weight:700;text-align:center;">&#10003;</span>`
        : now
          ? `<span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:13px;border:2px solid ${PRIMARY};color:${PRIMARY};font-size:12px;font-weight:700;text-align:center;">${n}</span>`
          : `<span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:13px;border:2px solid ${LINE};color:${MUTED};font-size:12px;font-weight:700;text-align:center;">${n}</span>`;
      return `<td align="center" width="33%" style="padding:14px 6px;${i > 0 ? `border-left:1px solid ${LINE};` : ""}">
        ${circle}
        <div style="margin-top:8px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${done || now ? INK : MUTED};">${esc(label)}</div>
      </td>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid ${LINE};border-radius:14px;"><tr>${cells}</tr></table>`;
}

/** A soft grey panel, or a dashed one for anything the reader has to act on. */
function panel(inner: string, tone: "soft" | "dashed" = "soft"): string {
  const box =
    tone === "dashed"
      ? `border:1.5px dashed ${PRIMARY};background:${SOFT};`
      : `background:${FOOT};`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr>
    <td style="${box}border-radius:14px;padding:18px 20px;font-size:14px;line-height:1.65;color:${INK};">${inner}</td>
  </tr></table>`;
}

/** Small capitals label used inside panels and above blocks. */
function eyebrowText(text: string): string {
  return `<p style="margin:0 0 8px;font-size:11px;line-height:1;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${MUTED};">${esc(text)}</p>`;
}

/**
 * A short message in the shared shell - account links, receipt links, staff
 * notices. `paragraphs` and `note` are HTML the caller has already escaped.
 */
export function simpleEmail(opts: {
  storeName: string;
  storeUrl: string;
  heading: string;
  preheader: string;
  paragraphs: string[];
  action?: { href: string; label: string };
  note?: string;
  eyebrow?: string;
}): string {
  return layout({
    storeName: opts.storeName,
    storeUrl: opts.storeUrl,
    heading: opts.heading,
    preheader: opts.preheader,
    eyebrow: opts.eyebrow,
    body:
      opts.paragraphs.map((text) => p(text)).join("") +
      (opts.action ? button(opts.action.href, opts.action.label) : "") +
      (opts.note ? p(`<span style="color:${MUTED};font-size:13px;">${opts.note}</span>`) : ""),
  });
}

/**
 * A newsletter written by staff in the rich text editor. `bodyHtml` has been
 * through sanitizeRichText; inline styles are added here because most mail
 * clients ignore anything but inline CSS. The unsubscribe link is required -
 * these are marketing emails.
 */
export function newsletterEmail(opts: {
  storeName: string;
  storeUrl: string;
  heading: string;
  preheader: string;
  bodyHtml: string;
  action?: { href: string; label: string };
  unsubscribeUrl: string;
}): string {
  const styled = (tag: string, style: string) => (html: string) =>
    html.replace(
      new RegExp(`<${tag}(?![^>]*\\bstyle=)(\\s[^>]*)?>`, "gi"),
      (_m, attrs = "") => `<${tag}${attrs} style="${style}">`,
    );
  const body = [
    styled("p", `margin:0 0 14px;font-size:15px;line-height:1.65;color:${INK};`),
    styled("h2", `margin:22px 0 10px;font-size:20px;line-height:1.3;color:${INK};`),
    styled("h3", `margin:20px 0 8px;font-size:17px;line-height:1.35;color:${INK};`),
    styled("h4", `margin:18px 0 8px;font-size:15px;line-height:1.4;color:${INK};`),
    styled("ul", `margin:0 0 14px;padding-left:22px;font-size:15px;line-height:1.65;color:${INK};`),
    styled("ol", `margin:0 0 14px;padding-left:22px;font-size:15px;line-height:1.65;color:${INK};`),
    styled("a", `color:${PRIMARY};text-decoration:underline;`),
    styled("img", "max-width:100%;height:auto;border:0;"),
    styled("blockquote", `margin:0 0 14px;padding-left:14px;border-left:3px solid ${LINE};color:${MUTED};`),
  ].reduce((html, fn) => fn(html), opts.bodyHtml);

  return layout({
    storeName: opts.storeName,
    storeUrl: opts.storeUrl,
    heading: opts.heading,
    preheader: opts.preheader,
    body:
      body +
      (opts.action ? button(opts.action.href, opts.action.label) : "") +
      p(
        `<span style="color:${MUTED};font-size:13px;">You're getting this because you signed up at ${esc(opts.storeName)}. <a href="${esc(opts.unsubscribeUrl)}" style="color:inherit;text-decoration:underline;">Unsubscribe</a>.</span>`,
      ),
  });
}

export { esc as escapeMailHtml };

function p(text: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${INK};">${text}</p>`;
}

/**
 * Line items plus the totals, shared by every order email. Each line is the
 * name in bold with the option under it, a quantity chip, and the price; the
 * total closes it on a dark bar, the one figure that matters most.
 */
function itemsTable(d: OrderMailData): string {
  const rows = d.lines
    .map(
      (l) => `<tr>
        <td style="padding:12px 0;border-bottom:1px solid ${LINE};font-size:14px;line-height:1.4;color:${INK};">
          <strong>${esc(l.name)}</strong>
          ${l.variant ? `<div style="font-size:12px;color:${MUTED};margin-top:2px;">${esc(l.variant)}</div>` : ""}
          ${
            l.barcodeUrl
              ? `<div style="margin-top:7px;"><img src="${esc(l.barcodeUrl)}" alt="" width="118" style="display:block;height:auto;border:0;" /></div>`
              : ""
          }
        </td>
        <td align="center" width="46" style="padding:12px 6px;border-bottom:1px solid ${LINE};">
          <span style="display:inline-block;min-width:22px;padding:3px 7px;border-radius:999px;background:${FOOT};border:1px solid ${LINE};font-size:12px;font-weight:700;color:${INK};">&times;${l.quantity}</span>
        </td>
        <td align="right" style="padding:12px 0;border-bottom:1px solid ${LINE};font-size:14px;font-weight:700;color:${INK};white-space:nowrap;">${esc(l.lineTotal)}</td>
      </tr>`,
    )
    .join("");

  /* `value` arrives already escaped: the discount row carries an &minus;
     entity, and escaping it here printed the entity's name in the email. */
  const totalRow = (label: string, value: string, accent = false) =>
    `<tr>
      <td style="padding:5px 0;font-size:13px;color:${MUTED};">${label}</td>
      <td align="right" style="padding:5px 0;font-size:13px;color:${accent ? "#0E7C66" : INK};white-space:nowrap;">${value}</td>
    </tr>`;

  return `
  ${eyebrowText("Your order")}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;">${rows}</table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 0;">
    ${d.giftCards ? totalRow("Gift cards", esc(d.giftCards)) : ""}
    ${d.digitalOnly ? "" : totalRow("Subtotal", esc(d.subtotal))}
    ${d.discount ? totalRow(`Discount${d.couponCode ? ` &middot; ${esc(d.couponCode)}` : ""}`, `&minus;${esc(d.discount)}`, true) : ""}
    ${d.digitalOnly ? "" : totalRow("Shipping", esc(d.shipping))}
    ${d.tax ? totalRow("Tax", esc(d.tax)) : ""}
    ${d.giftCardPaid ? totalRow("Paid by gift card", `&minus;${esc(d.giftCardPaid)}`, true) : ""}
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 22px;"><tr>
    <td bgcolor="${DARK}" style="background-color:${DARK};border-radius:12px;padding:14px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:14px;font-weight:600;color:rgba(255,255,255,0.7);">Total</td>
        <td align="right" style="font-size:20px;font-weight:800;color:#ffffff;white-space:nowrap;">${esc(d.total)}</td>
      </tr></table>
    </td>
  </tr></table>
  ${
    d.orderBarcodeUrl
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
    <tr><td align="center" style="padding-top:4px;">
      <img src="${esc(d.orderBarcodeUrl)}" alt="${esc(d.orderLabel)}" width="210" style="display:block;margin:0 auto;height:auto;border:0;" />
      <div style="font-size:11px;color:${MUTED};padding-top:5px;">Order ${esc(d.orderLabel)}</div>
    </td></tr>
  </table>`
      : ""
  }`;
}

function itemsText(d: OrderMailData): string {
  const lines = d.lines
    .map(
      (l) =>
        `  ${l.name}${l.variant ? ` - ${l.variant}` : ""} x${l.quantity}   ${l.lineTotal}`,
    )
    .join("\n");
  return `${lines}

${d.giftCards ? `\n  Gift cards: ${d.giftCards}` : ""}${d.digitalOnly ? "" : `\n  Subtotal: ${d.subtotal}`}${d.discount ? `\n  Discount: -${d.discount}` : ""}${d.digitalOnly ? "" : `\n  Shipping: ${d.shipping}`}${d.tax ? `\n  Tax: ${d.tax}` : ""}${d.giftCardPaid ? `\n  Paid by gift card: -${d.giftCardPaid}` : ""}
  Total: ${d.total}`;
}

/** Two columns: where it ships, and the order's number and date. */
function addressBlock(d: OrderMailData): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 6px;border-top:1px solid ${LINE};"><tr>
    <td width="50%" valign="top" style="padding:18px 12px 0 0;">
      ${eyebrowText(d.digitalOnly ? "Delivered to" : "Shipping to")}
      <p style="margin:0;font-size:13px;line-height:1.6;color:${INK};">${d.address.map(esc).join("<br>")}</p>
    </td>
    <td width="50%" valign="top" style="padding:18px 0 0 12px;">
      ${eyebrowText("Order")}
      <p style="margin:0;font-size:13px;line-height:1.6;color:${INK};"><strong>${esc(d.orderLabel)}</strong><br>${esc(d.orderDate)}</p>
    </td>
  </tr></table>`;
}

/* ---------------------------------------------------------------- customer */

export function orderPlacedEmail(d: OrderMailData, payInstructions: string) {
  const first = d.customerName.split(/\s+/)[0];
  const heading = `Thanks, ${first} — we've got it.`;
  return {
    subject: `Order ${d.orderLabel} received — ${d.storeName}`,
    html: layout({
      storeName: d.storeName,
      storeUrl: d.storeUrl,
      eyebrow: "Order confirmed",
      heading,
      lede: `Order ${d.orderLabel} · ${d.orderDate}`,
      preheader: `Order ${d.orderLabel} placed on ${d.orderDate}. Total ${d.total}.`,
      body:
        stepsRow(1) +
        (payInstructions
          ? panel(
              eyebrowText("How to pay") +
                `<div style="font-size:26px;font-weight:800;letter-spacing:-0.3px;color:${INK};margin:0 0 10px;">${esc(d.total)}</div>` +
                payInstructions,
              "dashed",
            )
          : "") +
        itemsTable(d) +
        (d.nextOrderCoupon
          ? panel(
              eyebrowText("A thank-you for next time") +
                `<div style="font-size:22px;font-weight:800;color:${INK};margin:0 0 6px;">${esc(d.nextOrderCoupon.offer)}</div>` +
                `<div style="display:inline-block;margin:4px 0 8px;padding:8px 16px;border:1px dashed ${PRIMARY};border-radius:8px;font-family:'Courier New',monospace;font-size:18px;font-weight:800;letter-spacing:2px;color:${INK};">${esc(d.nextOrderCoupon.code)}</div>` +
                `<div style="font-size:13px;color:${MUTED};">${esc(d.nextOrderCoupon.note)}</div>`,
              "dashed",
            )
          : "") +
        addressBlock(d) +
        button(d.receiptUrl ?? `${d.storeUrl}/account/orders`, "View your order") +
        p(`<span style="color:${MUTED};font-size:13px;">Something not right? Reply to this email and a person will sort it out.</span>`),
    }),
    text: `Thanks ${d.customerName} — we've got your order.

Order ${d.orderLabel}, placed ${d.orderDate}.

${itemsText(d)}

${d.digitalOnly ? "Delivered to" : "Shipping to"}:
${d.address.join("\n")}

${d.receiptUrl ?? `${d.storeUrl}/account/orders`}`,
  };
}

export function paymentReceivedEmail(d: OrderMailData) {
  return {
    subject: `Payment received for order ${d.orderLabel}`,
    html: layout({
      storeName: d.storeName,
      storeUrl: d.storeUrl,
      eyebrow: "Payment received",
      heading: "Paid — thank you.",
      lede: `We're packing order ${d.orderLabel} now. Tracking follows as soon as it ships.`,
      preheader: `We've received ${d.total} for order ${d.orderLabel}.`,
      body:
        stepsRow(2) +
        itemsTable(d) +
        addressBlock(d) +
        button(d.receiptUrl ?? `${d.storeUrl}/account/orders`, "View your order"),
    }),
    text: `Payment received.

We've received ${d.total} for order ${d.orderLabel}. It's now being packed, and
you'll get tracking as soon as it ships.

${itemsText(d)}

${d.storeUrl}/account/orders`,
  };
}

export function orderCompleteEmail(d: OrderMailData) {
  return {
    subject: `Order ${d.orderLabel} complete`,
    html: layout({
      storeName: d.storeName,
      storeUrl: d.storeUrl,
      eyebrow: "Order complete",
      heading: "All done — enjoy.",
      lede: `Order ${d.orderLabel} is complete. Your invoice is attached as a PDF.`,
      preheader: `Order ${d.orderLabel} — invoice attached.`,
      body:
        itemsTable(d) +
        button(`${d.storeUrl}/account/orders`, "View your order") +
        p(`<span style="color:${MUTED};font-size:13px;">If anything isn't right, reply to this email and we'll sort it out. Happy with it? A short review helps the next person choose.</span>`),
    }),
    text: `Your order is complete.

Order ${d.orderLabel} is complete. Your invoice is attached as a PDF.

${itemsText(d)}

${d.storeUrl}/account/orders`,
  };
}

export function shippedEmail(
  d: OrderMailData,
  shipment: { carrier: string; code: string; url?: string | null },
) {
  const code = shipment.url
    ? `<a href="${esc(shipment.url)}" style="color:${INK};text-decoration:none;">${esc(shipment.code)}</a>`
    : esc(shipment.code);

  return {
    subject: `Your order ${d.orderLabel} has shipped`,
    html: layout({
      storeName: d.storeName,
      storeUrl: d.storeUrl,
      eyebrow: "On its way",
      heading: "Your order has shipped.",
      lede: `Order ${d.orderLabel} left us with ${shipment.carrier}.`,
      preheader: `${shipment.carrier} ${shipment.code}`,
      body:
        stepsRow(3) +
        panel(
          eyebrowText(shipment.carrier) +
            `<div style="font-size:22px;font-weight:800;letter-spacing:1.5px;color:${INK};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${code}</div>` +
            `<div style="margin-top:6px;font-size:12px;color:${MUTED};">Tracking can take a few hours to show its first scan.</div>`,
        ) +
        (shipment.url ? button(shipment.url, "Track your parcel") : "") +
        itemsTable(d) +
        addressBlock(d),
    }),
    text: `Your order is on its way.

Order ${d.orderLabel} has shipped with ${shipment.carrier}.
Tracking: ${shipment.code}${shipment.url ? `\n${shipment.url}` : ""}

${itemsText(d)}

${d.digitalOnly ? "Delivered to" : "Shipping to"}:
${d.address.join("\n")}`,
  };
}

export function welcomeCodeEmail(opts: {
  storeName: string;
  storeUrl: string;
  code: string;
  headline: string;
  body: string;
}) {
  return {
    subject: `Your ${opts.storeName} welcome code: ${opts.code}`,
    html: layout({
      storeName: opts.storeName,
      storeUrl: opts.storeUrl,
      eyebrow: "Welcome",
      heading: opts.headline,
      preheader: `Your code is ${opts.code}.`,
      body:
        p(esc(opts.body)) +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr>
          <td bgcolor="${DARK}" align="center" style="background-color:${DARK};border-radius:14px;padding:26px 20px;">
            <p style="margin:0 0 8px;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;color:rgba(255,255,255,0.55);">Your code</p>
            <p style="margin:0;font-size:30px;font-weight:800;letter-spacing:4px;color:#ffffff;">${esc(opts.code)}</p>
          </td></tr></table>` +
        p(`<span style="color:${MUTED};font-size:13px;">One code per email address, and it can only be used by the account registered to this address.</span>`) +
        button(`${opts.storeUrl}/shop`, "Start shopping"),
    }),
    text: `${opts.headline}

${opts.body}

Your code: ${opts.code}

One code per email address, usable only by the account registered to it.

${opts.storeUrl}/shop`,
  };
}

/* --------------------------------------------------------------- gift card */

/**
 * The gift card email. "recipient": to the friend. "buyer-copy": the buyer's
 * copy of a card emailed to a friend. "buyer-to-give": a card sent to the
 * buyer to hand over in person.
 */
export function giftCardEmail(d: {
  amount: string;
  code: string;
  recipientName: string;
  senderName: string;
  message: string | null;
  storeName: string;
  storeUrl: string;
  mode: "recipient" | "buyer-copy" | "buyer-to-give";
}) {
  const subject =
    d.mode === "recipient"
      ? `${d.recipientName}, you've received a ${d.amount} ${d.storeName} gift card`
      : d.mode === "buyer-copy"
        ? `Your gift to ${d.recipientName} is on its way`
        : `Your ${d.amount} ${d.storeName} gift card for ${d.recipientName}`;
  const heading =
    d.mode === "recipient"
      ? `${d.senderName} sent you a gift card`
      : d.mode === "buyer-copy"
        ? `Your gift to ${d.recipientName} is on its way`
        : `Here's the gift card for ${d.recipientName}`;
  const lede =
    d.mode === "recipient"
      ? `A ${d.amount} ${d.storeName} gift card, ready to spend.`
      : d.mode === "buyer-copy"
        ? `We've emailed ${d.recipientName} their ${d.amount} gift card. Your copy of the code is below.`
        : `Pass this code on however you like — by card, by message, in person.`;

  const card = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr>
    <td bgcolor="${DARK}" align="center" style="background-color:${DARK};border-radius:16px;padding:30px 20px;">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;color:rgba(255,255,255,0.55);">${esc(d.storeName)} gift card</p>
      <p style="margin:0 0 18px;font-size:44px;line-height:1;font-weight:800;color:#ffffff;">${esc(d.amount)}</p>
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;color:rgba(255,255,255,0.55);">Your code</p>
      <p style="margin:0;display:inline-block;border:1px dashed rgba(255,255,255,0.45);border-radius:10px;padding:10px 18px;font-size:22px;font-weight:800;letter-spacing:3px;color:#ffffff;font-family:'Courier New',monospace;">${esc(d.code)}</p>
    </td></tr></table>`;

  const note = d.message
    ? panel(
        `<p style="margin:0 0 6px;font-size:12px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:1px;">A note from ${esc(d.senderName)}</p>
         <p style="margin:0;font-size:15px;line-height:1.6;color:${INK};white-space:pre-line;">${esc(d.message)}</p>`,
      )
    : "";

  const how = p(
    `<span style="color:${MUTED};font-size:13px;">How to use it: add anything to your cart, then enter the code in the <strong>Gift card</strong> box at checkout. Whatever isn't spent stays on the card for next time — no expiry.</span>`,
  );

  return {
    subject,
    html: layout({
      storeName: d.storeName,
      storeUrl: d.storeUrl,
      eyebrow: "Gift card",
      heading,
      lede,
      preheader: `${d.amount} gift card · code ${d.code}`,
      body: card + note + how + button(`${d.storeUrl}/shop`, "Shop now"),
    }),
    text: `${heading}

${lede}

Amount: ${d.amount}
Code: ${d.code}
${d.message ? `\nA note from ${d.senderName}:\n${d.message}\n` : ""}
Add anything to your cart, then enter the code in the Gift card box at checkout. Whatever isn't spent stays on the card for next time - no expiry.

${d.storeUrl}/shop`,
  };
}

/* ------------------------------------------------------------------- admin */

export function adminNewOrderEmail(
  d: OrderMailData,
  opts: { adminUrl: string; email: string; phone?: string | null },
) {
  return {
    subject: `New order ${d.orderLabel} — ${d.total}`,
    html: layout({
      storeName: d.storeName,
      storeUrl: d.storeUrl,
      eyebrow: "New order",
      heading: `${d.orderLabel} — ${d.total}`,
      lede: `${d.customerName} · ${opts.email}${opts.phone ? ` · ${opts.phone}` : ""} · ${d.orderDate}`,
      preheader: `${d.customerName} — ${d.total}`,
      body:
        itemsTable(d) +
        addressBlock(d) +
        button(opts.adminUrl, "Open in admin"),
    }),
    text: `New order ${d.orderLabel} — ${d.total}

${d.customerName}
${opts.email}${opts.phone ? `\n${opts.phone}` : ""}

${itemsText(d)}

${d.digitalOnly ? "Delivered to" : "Shipping to"}:
${d.address.join("\n")}

${opts.adminUrl}`,
  };
}

export function testEmail(storeName: string, storeUrl: string) {
  return {
    subject: `Test email from ${storeName}`,
    html: layout({
      storeName,
      storeUrl,
      eyebrow: "Settings",
      heading: "SMTP is working",
      preheader: "If you can read this, outgoing mail is configured correctly.",
      body:
        p("If you're reading this, your mail settings are correct and the shop can send email.") +
        p(`<span style="color:${MUTED};font-size:13px;">Sent from the Mail settings page.</span>`),
    }),
    text: `SMTP is working.

If you're reading this, your mail settings are correct and the shop can send
email. Sent from the Mail settings page at ${storeUrl}.`,
  };
}

/**
 * "Someone signed in from a new place." Sent to the admin's own address and to
 * the store's admin recipients, because the point is that the person who owns
 * the account may not be the person who signed in.
 */
export function newLocationEmail(opts: {
  storeName: string;
  storeUrl: string;
  adminName: string;
  when: string;
  ip: string;
  location: string;
  device: string;
  usedRecoveryCode: boolean;
}) {
  const row = (label: string, value: string) =>
    `<tr>
      <td style="padding:7px 0;font-size:13px;color:${MUTED};width:110px;vertical-align:top;">${esc(label)}</td>
      <td style="padding:7px 0;font-size:14px;color:${INK};">${esc(value)}</td>
    </tr>`;

  const lead = opts.usedRecoveryCode
    ? `A recovery code was used to sign in to the ${opts.storeName} admin. Recovery codes are single use - if this was not you, treat the account as compromised.`
    : `The ${opts.storeName} admin was signed in to from a device or place we have not seen on this account before.`;

  return {
    subject: opts.usedRecoveryCode
      ? `Recovery code used on ${opts.storeName} admin`
      : `New sign-in to ${opts.storeName} admin`,
    html: layout({
      storeName: opts.storeName,
      storeUrl: opts.storeUrl,
      eyebrow: "Security",
      heading: opts.usedRecoveryCode ? "Recovery code used" : "New sign-in location",
      preheader: `${opts.adminName} - ${opts.location || opts.ip}`,
      body:
        p(esc(lead)) +
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0;width:100%;">
          ${row("Account", opts.adminName)}
          ${row("When", opts.when)}
          ${row("IP address", opts.ip)}
          ${row("Location", opts.location || "Unknown")}
          ${row("Device", opts.device)}
        </table>` +
        p(
          `If this was you, nothing to do. If it was not, change the password and revoke the session on the <a href="${esc(
            `${opts.storeUrl}/admin/profile/security`,
          )}" style="color:${PRIMARY};font-weight:600;">security page</a> straight away.`,
        ),
    }),
    text: `${opts.usedRecoveryCode ? "Recovery code used" : "New sign-in location"}

${lead}

Account:  ${opts.adminName}
When:     ${opts.when}
IP:       ${opts.ip}
Location: ${opts.location || "Unknown"}
Device:   ${opts.device}

If this was not you, change the password and revoke the session:
${opts.storeUrl}/admin/profile/security`,
  };
}

/**
 * The password reset link.
 *
 * Deliberately says who asked and from where, and what to do if it wasn't them
 * - a reset email arriving unprompted is often the first sign someone is
 * working through a leaked password list.
 */
export function passwordResetEmail(opts: {
  storeName: string;
  storeUrl: string;
  resetUrl: string;
  minutes: number;
}) {
  return {
    subject: `Reset your ${opts.storeName} password`,
    html: layout({
      storeName: opts.storeName,
      storeUrl: opts.storeUrl,
      eyebrow: "Your account",
      heading: "Reset your password",
      preheader: `The link is good for ${opts.minutes} minutes.`,
      body:
        p("Someone asked to reset the password on this account. Use the button below to choose a new one.") +
        button(opts.resetUrl, "Choose a new password") +
        p(
          `<span style="color:${MUTED};font-size:13px;">The link works once and expires in ${opts.minutes} minutes. If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all;">${esc(opts.resetUrl)}</span></span>`,
        ) +
        p(
          `<span style="color:${MUTED};font-size:13px;">Didn't ask for this? You can ignore this email - your password stays as it is. If it keeps happening, someone may be trying your address, and it is worth changing your password to something you use nowhere else.</span>`,
        ),
    }),
    text: `Reset your ${opts.storeName} password

Someone asked to reset the password on this account. Open this link to choose
a new one. It works once and expires in ${opts.minutes} minutes.

${opts.resetUrl}

Didn't ask for this? Ignore this email - your password stays as it is.`,
  };
}

/** Confirmation after the fact, so a reset the owner did not do is visible. */
export function passwordChangedEmail(opts: {
  storeName: string;
  storeUrl: string;
  when: string;
}) {
  return {
    subject: `Your ${opts.storeName} password was changed`,
    html: layout({
      storeName: opts.storeName,
      storeUrl: opts.storeUrl,
      eyebrow: "Your account",
      heading: "Your password was changed",
      preheader: opts.when,
      body:
        p(`The password on your ${esc(opts.storeName)} account was changed on ${esc(opts.when)}, and everywhere that was signed in has been signed out.`) +
        p(
          `<span style="color:${MUTED};font-size:13px;">If that wasn't you, reset the password again straight away and contact us.</span>`,
        ),
    }),
    text: `Your password was changed

The password on your ${opts.storeName} account was changed on ${opts.when}, and
everywhere that was signed in has been signed out.

If that wasn't you, reset it again straight away and contact us.
${opts.storeUrl}`,
  };
}

/**
 * "You left something behind."
 *
 * Carries a real unsubscribe link, because this is a commercial message rather
 * than a transactional one - under CASL that link is not optional, and a
 * reminder people cannot switch off is how a sending domain gets blocklisted.
 */
export function abandonedCartEmail(opts: {
  storeName: string;
  storeUrl: string;
  recoverUrl: string;
  unsubscribeUrl: string;
  items: { name: string; variant?: string | null; quantity: number; price: string }[];
  total: string;
  stage: number;
  coupon?: string;
}) {
  const rows = opts.items
    .map(
      (i) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${INK};">
          ${esc(i.name)}${i.variant ? `<br><span style="color:${MUTED};font-size:12px;">${esc(i.variant)}</span>` : ""}
          <span style="color:${MUTED};"> &times;${i.quantity}</span>
        </td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${INK};white-space:nowrap;">${esc(i.price)}</td>
      </tr>`,
    )
    .join("");

  // The second and later nudges say something different, so a customer who
  // ignored the first does not simply receive it again word for word.
  const lead =
    opts.stage <= 1
      ? "You left these in your cart. We've kept them for you - picking up where you left off takes one click."
      : "Your cart is still waiting. We hold items while stock lasts, so this is a good moment to finish up if you still want them.";

  const couponBlock = opts.coupon
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
        <tr><td style="background:${SOFT};border:1.5px dashed ${PRIMARY};border-radius:14px;padding:18px;text-align:center;">
          <p style="margin:0 0 6px;font-size:13px;color:${MUTED};">Use this code at checkout</p>
          <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:2px;color:${PRIMARY};">${esc(opts.coupon)}</p>
        </td></tr>
      </table>`
    : "";

  return {
    subject:
      opts.stage <= 1
        ? `You left something in your cart`
        : `Still thinking it over? Your cart is waiting`,
    html: layout({
      storeName: opts.storeName,
      storeUrl: opts.storeUrl,
      eyebrow: "Still in your bag",
      heading: "Your cart is still here",
      preheader: `${opts.items.length} item${opts.items.length === 1 ? "" : "s"} - ${opts.total}`,
      body:
        p(esc(lead)) +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;">
          ${rows}
          <tr>
            <td style="padding:12px 0;font-size:15px;font-weight:700;color:${INK};">Total</td>
            <td align="right" style="padding:12px 0;font-size:15px;font-weight:700;color:${PRIMARY};">${esc(opts.total)}</td>
          </tr>
        </table>` +
        couponBlock +
        button(opts.recoverUrl, "Return to my cart") +
        `<p style="margin:22px 0 0;padding-top:16px;border-top:1px solid ${LINE};font-size:12px;line-height:1.6;color:${MUTED};">
          Don't want reminders like this?
          <a href="${esc(opts.unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a>.
          You'll still get emails about orders you place.
        </p>`,
    }),
    text: `${lead}

${opts.items.map((i) => `- ${i.name}${i.variant ? ` (${i.variant})` : ""} x${i.quantity}  ${i.price}`).join("\n")}

Total: ${opts.total}
${opts.coupon ? `\nUse code ${opts.coupon} at checkout.\n` : ""}
Return to your cart:
${opts.recoverUrl}

Don't want reminders like this? Unsubscribe:
${opts.unsubscribeUrl}`,
  };
}

/**
 * One step of the abandoned-cart follow-up sequence.
 *
 * The wording comes from the template the shop wrote, with its merge fields
 * already filled in; everything around it - the item table, the coupon block,
 * the button and the unsubscribe line - is the house shell, so a badly written
 * template can still only produce a correctly formed, lawful email.
 */
export function cartFollowUpEmail(opts: {
  storeName: string;
  storeUrl: string;
  recoverUrl: string;
  unsubscribeUrl: string;
  subject: string;
  /** Template body with merge fields already substituted. Blank lines split paragraphs. */
  bodyText: string;
  items: { name: string; variant?: string | null; quantity: number; price: string }[];
  total: string;
  coupon?: string;
}) {
  const rows = opts.items
    .map(
      (i) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${INK};">
          ${esc(i.name)}${i.variant ? `<br><span style="color:${MUTED};font-size:12px;">${esc(i.variant)}</span>` : ""}
          <span style="color:${MUTED};"> &times;${i.quantity}</span>
        </td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${INK};white-space:nowrap;">${esc(i.price)}</td>
      </tr>`,
    )
    .join("");

  const paragraphs = opts.bodyText
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => p(esc(para).replace(/\n/g, "<br>")))
    .join("");

  const couponBlock = opts.coupon
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
        <tr><td style="background:${SOFT};border:1.5px dashed ${PRIMARY};border-radius:14px;padding:18px;text-align:center;">
          <p style="margin:0 0 6px;font-size:13px;color:${MUTED};">Use this code at checkout</p>
          <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:2px;color:${PRIMARY};">${esc(opts.coupon)}</p>
        </td></tr>
      </table>`
    : "";

  return {
    subject: opts.subject,
    html: layout({
      storeName: opts.storeName,
      storeUrl: opts.storeUrl,
      eyebrow: "Still in your bag",
      heading: "Your cart is still here",
      preheader: `${opts.items.length} item${opts.items.length === 1 ? "" : "s"} - ${opts.total}`,
      body:
        paragraphs +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;">
          ${rows}
          <tr>
            <td style="padding:12px 0;font-size:15px;font-weight:700;color:${INK};">Total</td>
            <td align="right" style="padding:12px 0;font-size:15px;font-weight:700;color:${PRIMARY};">${esc(opts.total)}</td>
          </tr>
        </table>` +
        couponBlock +
        button(opts.recoverUrl, "Complete your purchase") +
        `<p style="margin:22px 0 0;padding-top:16px;border-top:1px solid ${LINE};font-size:12px;line-height:1.6;color:${MUTED};">
          Don't want reminders like this?
          <a href="${esc(opts.unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a>.
          You'll still get emails about orders you place.
        </p>`,
    }),
    text: `${opts.bodyText}

${opts.items.map((i) => `- ${i.name}${i.variant ? ` (${i.variant})` : ""} x${i.quantity}  ${i.price}`).join("\n")}

Total: ${opts.total}
${opts.coupon ? `\nUse code ${opts.coupon} at checkout.\n` : ""}
Complete your purchase: ${opts.recoverUrl}

Unsubscribe: ${opts.unsubscribeUrl}`,
  };
}
