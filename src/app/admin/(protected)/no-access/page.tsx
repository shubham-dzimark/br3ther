import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { capabilitiesFor, landingFor, ROLE_LABELS } from "@/lib/permissions";
import { Card, btnPrimary } from "@/components/admin/ui";

export const metadata: Metadata = { title: "No access" };
export const dynamic = "force-dynamic";

/**
 * The dead end for a role that cannot open the page it asked for.
 *
 * Deliberately gated on nothing but being signed in. Every other admin page
 * asserts a capability and redirects when it fails, so this is the one place a
 * refused redirect can always land without bouncing.
 */
export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const [{ denied }, me] = await Promise.all([searchParams, requireAdmin()]);
  const caps = capabilitiesFor(me.role);
  const home = landingFor(me.role);

  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="p-8 text-center">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
          <svg viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-7 w-7">
            <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
            <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
          </svg>
        </span>

        <h1 className="text-xl font-semibold text-slate-900">
          You don&apos;t have access to that
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Your account is a{" "}
          <strong className="font-semibold text-slate-700">
            {ROLE_LABELS[me.role] ?? me.role}
          </strong>
          {denied ? (
            <>
              , which doesn&apos;t include{" "}
              <strong className="font-semibold text-slate-700">{denied}</strong>
            </>
          ) : null}
          . Ask a Master to change your role if you need it.
        </p>

        {caps.length > 0 ? (
          <p className="mt-5 text-xs text-slate-400">
            You can use: {caps.join(", ")}.
          </p>
        ) : (
          <p className="mt-5 text-xs text-slate-400">
            This role currently has no areas assigned to it.
          </p>
        )}

        {home !== "/admin/no-access" ? (
          <Link href={home} className={`${btnPrimary} mt-7 inline-block`}>
            Go to my dashboard
          </Link>
        ) : null}
      </Card>
    </div>
  );
}
