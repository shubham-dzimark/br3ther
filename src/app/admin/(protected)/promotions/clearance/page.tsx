import type { Metadata } from "next";
import { DealsScreen } from "@/components/admin/DealsScreen";
import { requireCapability } from "@/lib/permissions";

export const metadata: Metadata = { title: "Clearance deal" };
export const dynamic = "force-dynamic";

export default async function ClearancePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; edit?: string }>;
}) {
  await requireCapability("promotions");
  const { saved, edit } = await searchParams;
  return (
    <DealsScreen
      type="CLEARANCE"
      slug="clearance"
      title="Clearance deals"
      blurb="Long-running markdowns for stock you want to move out."
      saved={saved}
      editId={edit}
    />
  );
}
