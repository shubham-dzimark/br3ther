import Link from "next/link";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { SiteHeader } from "./Chrome";

/** The follow-up pages (receipt, tracking, account): the site's bar, the page, a slim close. */
export async function Shell({ children }: { children: React.ReactNode }) {
  const customer = await getCurrentCustomer();
  return (
    <>
      <SiteHeader signedIn={Boolean(customer)} />
      <main id="main" className="page">
        <div className="page__inner">{children}</div>
      </main>
      <footer className="on-dark" style={{ background: "var(--dark)", color: "var(--on-dark)", padding: "28px var(--m)" }}>
        <div className="page__inner" style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", fontSize: "0.9375rem" }}>
          <span>© {new Date().getFullYear()} Br3thr</span>
          <span style={{ display: "flex", gap: 24 }}>
            <Link href="/">Shop</Link>
            <Link href="/track-order">Track order</Link>
            <a href="mailto:help@br3thr.com">help@br3thr.com</a>
          </span>
        </div>
      </footer>
    </>
  );
}

/** Heading block for a follow-up page. */
export function PageHead({ title, lede }: { title: string; lede?: React.ReactNode }) {
  return (
    <header style={{ marginBottom: 40 }}>
      <h1 className="display page__title">{title}</h1>
      {lede ? <p className="lead muted" style={{ maxWidth: "40ch" }}>{lede}</p> : null}
    </header>
  );
}

/** A labelled input in the site's style. */
export function Field({
  label, name, type = "text", autoComplete, required = true, defaultValue, hint,
}: {
  label: string; name: string; type?: string; autoComplete?: string; required?: boolean; defaultValue?: string; hint?: string;
}) {
  const id = `f-${name}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} autoComplete={autoComplete} required={required} defaultValue={defaultValue} aria-describedby={hint ? `${id}-hint` : undefined} />
      {hint ? <p id={`${id}-hint`} className="small muted" style={{ marginTop: 6 }}>{hint}</p> : null}
    </div>
  );
}
