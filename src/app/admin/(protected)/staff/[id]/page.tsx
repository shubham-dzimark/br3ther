import EditAdminPage from "../../users/[id]/page";

export { metadata } from "../../users/[id]/page";
export const dynamic = "force-dynamic";

/*
 * The same editor as /admin/users/[id], mounted under /admin/staff so the
 * sidebar keeps Staff highlighted and saves return to the staff list. Shared
 * rather than duplicated so the two can never drift apart.
 */
export default function StaffMemberPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  return <EditAdminPage {...props} scope="staff" />;
}
