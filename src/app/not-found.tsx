import Link from "next/link";
import SiteLayout from "@/app/(site)/layout";
import { WordSvg, BR3THR } from "@/components/site/Wordmark";

/**
 * The site-wide 404. Next renders this root file for any address that matches
 * nothing, so it wears the site's own layout by hand.
 */
export default function NotFound() {
  return (
    <SiteLayout>
      <main className="page" style={{ display: "grid", alignContent: "space-between", minHeight: "100svh", paddingTop: 40 }}>
        <Link href="/" aria-label="BR3THR home" style={{ width: 160, display: "block" }}>
          <WordSvg letters={BR3THR} />
        </Link>
        <div>
          <h1 className="display page__title">Nothing here.</h1>
          <p className="lead muted" style={{ maxWidth: "34ch" }}>
            The page you were looking for has gone. Br3thr is one page now, with one product on it.
          </p>
          <p style={{ marginTop: 32 }}>
            <Link className="btn" href="/">Go to the shop <span className="arrow" aria-hidden="true">→</span></Link>
          </p>
        </div>
        <span />
      </main>
    </SiteLayout>
  );
}
