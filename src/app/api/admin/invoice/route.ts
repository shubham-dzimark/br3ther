import { requireCapability, can } from "@/lib/permissions";
import { buildInvoicePdf } from "@/lib/invoice-pdf";

export const dynamic = "force-dynamic";

/** The same PDF the customer is emailed, for staff to download or re-send. */
export async function GET(request: Request): Promise<Response> {
  const me = await requireCapability("orders");

  const id = new URL(request.url).searchParams.get("order") ?? "";
  if (!id) return new Response("No order given.", { status: 400 });

  // Contact details only for a role that is allowed to see them anywhere else.
  const pdf = await buildInvoicePdf(id, {
    includeContact: can(me.role, "customer_pii"),
  });
  if (!pdf) return new Response("Order not found.", { status: 404 });

  return new Response(new Uint8Array(pdf.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
