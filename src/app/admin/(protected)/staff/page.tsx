import type { Metadata } from "next";
import { AdminAccountsScreen } from "@/components/admin/AdminAccountsScreen";

export const metadata: Metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  return <AdminAccountsScreen scope="staff" saved={saved} error={error} />;
}
