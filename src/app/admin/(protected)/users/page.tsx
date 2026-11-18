import type { Metadata } from "next";
import { AdminAccountsScreen } from "@/components/admin/AdminAccountsScreen";

export const metadata: Metadata = { title: "Administrators" };
export const dynamic = "force-dynamic";

export default async function AdminsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  return <AdminAccountsScreen scope="admins" saved={saved} error={error} />;
}
