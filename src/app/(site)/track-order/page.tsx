import type { Metadata } from "next";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { Shell, PageHead } from "@/components/site/Shell";
import { TrackForm } from "./TrackForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Track your order" };

export default async function TrackOrderPage() {
  const customer = await getCurrentCustomer();
  return (
    <Shell>
      <PageHead title="Track your order" lede="Where your No.3 is, from payment to your door." />
      <TrackForm defaultEmail={customer?.email ?? ""} />
    </Shell>
  );
}
