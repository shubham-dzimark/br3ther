import type { Metadata } from "next";
import { DealsScreen } from "@/components/admin/DealsScreen";
import { requireCapability } from "@/lib/permissions";

export const metadata: Metadata = { title: "Flash sales" };
export const dynamic = "force-dynamic";

export default async function FlashSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; edit?: string }>;
}) {
  await requireCapability("promotions");
  const { saved, edit } = await searchParams;
  return (
    <DealsScreen
      type="FLASH"
      slug="flash-sales"
      title="Flash sales"
      blurb="Short, time-boxed discounts on a hand-picked set of products."
      saved={saved}
      editId={edit}
    />
  );
}
