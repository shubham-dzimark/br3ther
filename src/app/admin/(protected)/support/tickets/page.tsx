import type { Metadata } from "next";
import { TicketsScreen } from "@/components/admin/TicketsScreen";
import { requireCapability } from "@/lib/permissions";

export const metadata: Metadata = { title: "Support & ticket" };
export const dynamic = "force-dynamic";

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{
    ticket?: string;
    saved?: string;
    purged?: string;
    n?: string;
    error?: string;
  }>;
}) {
  await requireCapability("support");
  const { ticket, saved, purged, n, error } = await searchParams;
  return (
    <TicketsScreen
      back="tickets"
      title="Support & ticket"
      blurb="Every support conversation, including closed ones."
      selectedId={ticket}
      saved={saved}
      showCleanup
      purged={purged}
      purgedCount={n}
      error={error}
    />
  );
}
