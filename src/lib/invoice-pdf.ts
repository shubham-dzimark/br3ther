import "server-only";
import { getBarcodeConfig, renderBarcodePng } from "@/lib/barcode";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { getMoneyFormatter } from "@/lib/currency";
import { orderNo } from "@/lib/order-display";
import { getTimeZone, ymd } from "@/lib/timezone";

/**
 * The invoice as a PDF, for attaching to email.
 *
 * Drawn with pdfkit rather than rendered from the HTML invoice page through a
 * headless browser: Chromium is ~300 MB and a second runtime to keep alive on
 * a small VPS, for a document that is a header, a table and a totals block.
 * The trade-off is that this layout and the on-screen invoice are maintained
 * separately - they are deliberately kept to the same fields and order.
 *
 * Money is formatted as a plain decimal with the currency code, not through
 * the storefront formatter: PDF core fonts are WinAnsi, so a symbol outside
 * that range (₹, ₪) would throw mid-document rather than degrade.
 */

const INK = "#000000";
const MUTED = "#222222";
const LINE = "#e5e7eb";

export type InvoicePdf = { filename: string; buffer: Buffer };

function money(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

export async function buildInvoicePdf(
  orderId: string,
  opts: { includeContact?: boolean } = {},
): Promise<InvoicePdf | null> {
  /*
   * The customer's email is contact information, not a shipping detail. A role
   * without "customer_pii" sees it redacted here for the same reason the order
   * list redacts it - otherwise the download route was a way around that rule.
   * The copy emailed to the customer includes it, since it is their own.
   */
  const includeContact = opts.includeContact ?? true;
  const tz = await getTimeZone();
  const [order, settings, formatter, barcodeConfig] = await Promise.all([
    prisma.order.findUnique({ where: { id: orderId }, include: { items: true } }),
    getSettings(),
    getMoneyFormatter(),
    getBarcodeConfig(),
  ]);
  if (!order) return null;

  const storeName = settings[SETTING_KEYS.storeName] || "Br3thr";
  const storeAddress = settings[SETTING_KEYS.storeAddress]?.trim() ?? "";
  const storeEmail = settings[SETTING_KEYS.contactEmail]?.trim() ?? "";
  const label = orderNo(order.orderNumber);
  const cash = (c: number) => money(c, order.currency);
  void formatter;

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  // ---- Header ----
  doc.fillColor(INK).fontSize(26).font("Helvetica").text("Invoice", 50, 50);
  doc.fontSize(11).font("Helvetica-Bold").text(storeName, 300, 52, { width: 245, align: "right" });
  doc.font("Helvetica").fillColor(MUTED).fontSize(9);
  if (storeAddress) doc.text(storeAddress, 300, doc.y, { width: 245, align: "right" });
  if (storeEmail) doc.text(storeEmail, 300, doc.y, { width: 245, align: "right" });

  /*
   * The order number as a scannable code, so a printed invoice can be pulled
   * up at the desk the same way a packing slip is. `fit` bounds it, so a tall
   * render can never run into the "Billed to" block below.
   */
  if (barcodeConfig.enabled && barcodeConfig.onInvoice) {
    const png = await renderBarcodePng(order.orderNumber, "code128", { height: 8, scale: 2 });
    if (png) doc.image(png, 385, 92, { fit: [160, 32], align: "right" });
  }

  // ---- Parties ----
  let top = 130;
  doc.fillColor(INK).fontSize(10).font("Helvetica-Bold").text("Billed to", 50, top);
  doc.font("Helvetica").fontSize(10);
  const billed = [
    order.shipName,
    order.shipLine1,
    order.shipLine2 ?? "",
    `${order.shipCity} ${order.shipRegion} ${order.shipPostalCode}`,
    order.shipCountry,
    includeContact ? order.email : "",
  ].filter(Boolean);
  doc.text(billed.join("\n"), 50, top + 16, { width: 240 });

  const meta: [string, string][] = [
    ["Invoice number", label],
    ["Date", ymd(order.createdAt, tz)],
    ["Payment", "Interac e-Transfer"],
    ["Status", order.status.replace(/_/g, " ").toLowerCase()],
  ];
  let metaY = top + 16;
  for (const [k, v] of meta) {
    doc.font("Helvetica").fillColor(MUTED).fontSize(9).text(k, 320, metaY, { width: 110 });
    doc.font("Helvetica-Bold").fillColor(INK).fontSize(9).text(v, 435, metaY, { width: 110, align: "right" });
    metaY += 15;
  }

  // ---- Items ----
  top = Math.max(doc.y, metaY) + 30;
  const cols = { name: 50, qty: 330, unit: 385, total: 470 };
  const widths = { name: 270, qty: 45, unit: 75, total: 75 };

  doc.rect(50, top, 495, 22).fill(INK);
  doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold");
  doc.text("Product", cols.name + 6, top + 7, { width: widths.name });
  doc.text("Qty", cols.qty, top + 7, { width: widths.qty, align: "right" });
  doc.text("Unit", cols.unit, top + 7, { width: widths.unit, align: "right" });
  doc.text("Total", cols.total, top + 7, { width: widths.total, align: "right" });

  let y = top + 30;
  doc.font("Helvetica").fontSize(9).fillColor(INK);
  for (const item of order.items) {
    // A long product name wraps, so the row height is measured, not assumed.
    const name = [item.nameSnapshot, item.variantSnapshot].filter(Boolean).join(" - ");
    const nameHeight = doc.heightOfString(name, { width: widths.name });

    // Start a new page before drawing a row that would run off this one.
    if (y + nameHeight > 720) {
      doc.addPage();
      y = 60;
    }

    doc.fillColor(INK).text(name, cols.name + 6, y, { width: widths.name });
    doc.text(String(item.quantity), cols.qty, y, { width: widths.qty, align: "right" });
    doc.text(cash(item.unitPriceCents), cols.unit, y, { width: widths.unit, align: "right" });
    doc.text(
      item.isGift ? "Free" : cash(item.lineTotalCents),
      cols.total,
      y,
      { width: widths.total, align: "right" },
    );

    y += Math.max(nameHeight, 12) + 8;
    doc.moveTo(50, y - 4).lineTo(545, y - 4).strokeColor(LINE).lineWidth(0.5).stroke();
  }

  // ---- Totals ----
  y += 12;
  if (y > 660) {
    doc.addPage();
    y = 60;
  }

  const rows: [string, string, boolean][] = [
    ["Subtotal", cash(order.subtotalCents), false],
    ...(order.discountCents > 0
      ? ([[
          order.couponCode ? `Discount (${order.couponCode})` : "Discount",
          `-${cash(order.discountCents)}`,
          false,
        ]] as [string, string, boolean][])
      : []),
    ["Shipping", order.shippingCents > 0 ? cash(order.shippingCents) : "Free", false],
    ...(order.taxCents > 0
      ? ([["Tax", cash(order.taxCents), false]] as [string, string, boolean][])
      : []),
    ["Total", cash(order.totalCents), true],
  ];

  for (const [k, v, strong] of rows) {
    if (strong) {
      doc.moveTo(330, y - 4).lineTo(545, y - 4).strokeColor(INK).lineWidth(1).stroke();
      y += 4;
    }
    doc
      .font(strong ? "Helvetica-Bold" : "Helvetica")
      .fontSize(strong ? 11 : 9)
      .fillColor(INK)
      .text(k, 330, y, { width: 120 })
      .text(v, 455, y, { width: 90, align: "right" });
    y += strong ? 20 : 15;
  }

  if (order.customerNote) {
    y += 14;
    doc.font("Helvetica-Bold").fontSize(9).text("Customer note", 50, y);
    doc.font("Helvetica").fillColor(MUTED).text(order.customerNote, 50, y + 13, { width: 400 });
  }

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(MUTED)
    .text(`Thank you for shopping with ${storeName}.`, 50, 770, {
      width: 495,
      align: "center",
    });

  doc.end();
  return { filename: `invoice-${label.replace("#", "")}.pdf`, buffer: await done };
}
