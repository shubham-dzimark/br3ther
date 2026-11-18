import type { Metadata } from "next";
import { TicketsScreen } from "@/components/admin/TicketsScreen";
import { requireCapability } from "@/lib/permissions";
import { InboxLive } from "@/components/admin/InboxLive";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string; saved?: string; purged?: string; n?: string }>;
}) {
  await requireCapability("support");
  const { ticket, saved, purged, n } = await searchParams;
  return (
    <>
      <InboxLive />
      <TicketsScreen
      back="inbox"
      title="Inbox"
      blurb="Conversations still needing a reply. Resolved and closed threads live under Support & ticket."
      where={{ status: { in: ["OPEN", "PENDING"] } }}
      selectedId={ticket}
      saved={saved}
      purged={purged}
      purgedCount={n}
      />
    </>
  );
}
