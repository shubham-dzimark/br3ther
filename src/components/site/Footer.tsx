import Link from "next/link";
import { WordSvg, BR3THR } from "./Wordmark";

/* Photograph credits, required by their licences and kept on the page. */
const CREDITS = [
  "Rodion Kutsaev",
  "Erez Attias",
  "davide ragusa",
  "Charlie Foster",
  "Jeff Sheldon",
  "Dorothee Hübner",
  "Rob Bye",
];

export function Footer({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className="foot on-dark" aria-labelledby="foot-title">
      <h2 id="foot-title" className="sr-only">About Br3thr</h2>
      <div className="foot__cols">
        <div>
          <h2>Shop</h2>
          <ul>
            <li><Link href="/#buy">Buy No.3</Link></li>
            <li><Link href="/track-order">Track an order</Link></li>
            <li><Link href={signedIn ? "/account" : "/account/login"}>{signedIn ? "Your account" : "Sign in"}</Link></li>
          </ul>
        </div>
        <div>
          <h2>Help</h2>
          <ul>
            <li><Link href="/#faq">Questions</Link></li>
            <li><a href="mailto:help@br3thr.com">help@br3thr.com</a></li>
          </ul>
        </div>
        <div>
          <h2>Payment</h2>
          <ul>
            <li>Interac e-Transfer</li>
            <li>Crypto</li>
            <li>Shipping across Canada</li>
          </ul>
        </div>
        <div>
          <h2>Photographs</h2>
          <p>
            {CREDITS.join(", ")} (Unsplash licence). Stairs: rawpixel, CC0.
          </p>
        </div>
      </div>
      <div />
      <div className="foot__mark">
        <WordSvg letters={BR3THR} title="BR3THR" />
      </div>
      <div className="foot__legal">
        <span>© {new Date().getFullYear()} Br3thr. No.3 Daily Blend is a demo product.</span>
        <span>
          <Link href="/admin">Staff</Link>
        </span>
      </div>
    </footer>
  );
}
