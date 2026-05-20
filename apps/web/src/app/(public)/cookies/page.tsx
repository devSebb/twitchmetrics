import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/constants/seo";

export const revalidate = 86400;

const LAST_UPDATED = "2026-05-20";

export const metadata: Metadata = {
  title: "Cookies Policy",
  description:
    "How TwitchMetrics uses cookies, what each cookie does, and how to manage them.",
  alternates: {
    canonical: `${SITE_URL}/cookies`,
  },
};

type CookieRow = {
  name: string;
  purpose: string;
  duration: string;
  party: "First-party" | "Third-party";
  category: "Strictly necessary" | "Functional" | "Analytics" | "Marketing";
};

const COOKIES: CookieRow[] = [
  {
    name: "__Secure-authjs.session-token",
    purpose:
      "Identifies the signed-in user across page loads. Issued after login as a signed JWT. Without it, you would have to sign in again on every request.",
    duration: "Up to 30 days, refreshed on activity",
    party: "First-party",
    category: "Strictly necessary",
  },
  {
    name: "authjs.csrf-token",
    purpose:
      "Protects sign-in, sign-out, and account forms against cross-site request forgery. Compared against a hidden form token on each request.",
    duration: "Session (cleared when the browser is closed)",
    party: "First-party",
    category: "Strictly necessary",
  },
  {
    name: "authjs.callback-url",
    purpose:
      "Remembers where to return you after completing an authentication flow (for example, after signing in with an external provider).",
    duration: "Session (cleared when the browser is closed)",
    party: "First-party",
    category: "Strictly necessary",
  },
];

export default function CookiesPage() {
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(LAST_UPDATED));

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-6 sm:p-10">
        <div className="mb-6 border-b border-[#3F4147] pb-6">
          <h1 className="text-2xl font-bold text-[#F2F3F5] sm:text-3xl">
            Cookies Policy
          </h1>
          <p className="mt-2 text-xs text-[#949BA4]">
            Last updated: {formattedDate}
          </p>
        </div>

        <article className="legal-prose">
          <h2>What are cookies?</h2>
          <p>
            Cookies are small text files that a website stores on your device
            when you visit it. They allow the site to remember things between
            page loads, such as whether you are signed in. Some cookies are
            essential for the site to work; others are used for analytics or
            advertising.
          </p>
          <p>
            Throughout this policy, &ldquo;cookies&rdquo; also covers similar
            technologies such as browser local storage when used for the same
            purposes.
          </p>

          <h2>How we use cookies on TwitchMetrics</h2>
          <p>
            We use cookies only where they are necessary to operate the service
            you have asked for. Specifically, cookies on TwitchMetrics are used
            to:
          </p>
          <ul>
            <li>Keep you signed in after you log in.</li>
            <li>
              Protect sign-in and account actions against cross-site request
              forgery (CSRF) attacks.
            </li>
            <li>
              Return you to the correct page after completing an authentication
              flow.
            </li>
          </ul>
          <p>
            We do <strong>not</strong> use cookies for advertising, behavioural
            tracking, audience profiling, or third-party analytics. We do not
            sell or share cookie data with advertisers or data brokers.
          </p>

          <h2>The cookies we set</h2>
          <p>
            The table below lists every cookie that TwitchMetrics sets directly
            on your browser. All of them are classified as{" "}
            <strong>strictly necessary</strong> under the EU ePrivacy Directive,
            which means we are permitted to set them without first asking for
            your consent — but we still disclose them here for transparency.
          </p>
          <div className="mt-4 overflow-x-auto rounded-md border border-[#3F4147]">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-[#2B2D31] text-[#DBDEE1]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Purpose</th>
                  <th className="px-3 py-2 font-semibold">Duration</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                </tr>
              </thead>
              <tbody className="text-[#DBDEE1]">
                {COOKIES.map((c) => (
                  <tr
                    key={c.name}
                    className="border-t border-[#3F4147] align-top"
                  >
                    <td className="px-3 py-3 font-mono text-[11px] text-[#F2F3F5]">
                      {c.name}
                    </td>
                    <td className="px-3 py-3 leading-relaxed">{c.purpose}</td>
                    <td className="px-3 py-3 text-[#949BA4]">{c.duration}</td>
                    <td className="px-3 py-3 text-[#949BA4]">
                      {c.party}
                      <br />
                      <span className="text-[#6D7079]">{c.category}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Cookie names may appear without the{" "}
            <code className="font-mono text-[#F2F3F5]">__Secure-</code> prefix
            in non-HTTPS environments such as a local development server.
          </p>

          <h2>Third-party services</h2>
          <p>
            Some features of TwitchMetrics redirect you to services operated by
            third parties. Those services may set their own cookies on their own
            domains. We do not control those cookies and they are governed by
            the privacy policies of the relevant provider:
          </p>
          <ul>
            <li>
              <strong>Stripe</strong> — when you buy a report, you are
              redirected to Stripe&rsquo;s checkout pages. Stripe sets cookies
              on{" "}
              <code className="font-mono text-[#F2F3F5]">
                checkout.stripe.com
              </code>{" "}
              to process payments and detect fraud. See{" "}
              <Link
                href="https://stripe.com/cookies-policy/legal"
                target="_blank"
                rel="noopener noreferrer"
              >
                Stripe&rsquo;s Cookie Policy
              </Link>
              .
            </li>
            <li>
              <strong>External authentication providers</strong> — if you sign
              in using an external account (for example, Twitch or Google), that
              provider sets cookies on its own domain during the sign-in flow.
              We do not receive those cookies.
            </li>
          </ul>

          <h2>Analytics, advertising and tracking</h2>
          <p>
            TwitchMetrics currently does not load any analytics, advertising,
            social-media, or behavioural-tracking cookies or scripts. There is
            no Google Analytics, Meta Pixel, advertising retargeting, or similar
            technology embedded on the site.
          </p>
          <p>
            If we introduce any analytics or marketing cookies in the future, we
            will update this policy and show you a clear consent banner before
            any non-essential cookie is set. You will be able to accept or
            reject each category independently, and to change your preferences
            at any time.
          </p>

          <h2>Managing cookies in your browser</h2>
          <p>
            You can view, block, or delete cookies through your browser settings
            at any time. The exact steps vary by browser; see the help pages for{" "}
            <Link
              href="https://support.google.com/chrome/answer/95647"
              target="_blank"
              rel="noopener noreferrer"
            >
              Chrome
            </Link>
            ,{" "}
            <Link
              href="https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer"
              target="_blank"
              rel="noopener noreferrer"
            >
              Firefox
            </Link>
            ,{" "}
            <Link
              href="https://support.apple.com/guide/safari/manage-cookies-sfri11471"
              target="_blank"
              rel="noopener noreferrer"
            >
              Safari
            </Link>
            , or{" "}
            <Link
              href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09"
              target="_blank"
              rel="noopener noreferrer"
            >
              Edge
            </Link>
            .
          </p>
          <p>
            Please note that blocking the strictly necessary cookies above will
            prevent you from staying signed in or completing account actions.
            The site itself will still load, but features that require an
            account will not work.
          </p>

          <h2>How we keep these cookies secure</h2>
          <p>
            The authentication cookies described above are configured with the
            following protections:
          </p>
          <ul>
            <li>
              <strong>HttpOnly</strong> — the cookie cannot be read by
              JavaScript running in the page, which prevents it from being
              stolen by a cross-site scripting (XSS) attack.
            </li>
            <li>
              <strong>Secure</strong> — the cookie is only sent over encrypted
              HTTPS connections, so it cannot be intercepted on untrusted
              networks.
            </li>
            <li>
              <strong>SameSite=Lax</strong> — the cookie is not sent on most
              cross-site requests, which mitigates CSRF attacks.
            </li>
            <li>
              <strong>
                <code className="font-mono">__Secure-</code> name prefix
              </strong>{" "}
              — browsers refuse to set this cookie over plain HTTP, including
              from a subdomain, providing an additional integrity guarantee.
            </li>
            <li>
              <strong>Signed contents</strong> — the session cookie is a JSON
              Web Token signed with a server-side secret. Its contents cannot be
              modified without invalidating the signature.
            </li>
          </ul>

          <h2>Your rights</h2>
          <p>
            Where the EU General Data Protection Regulation (GDPR), the UK GDPR,
            or comparable laws apply, you have the right to access, correct, or
            delete personal data we hold about you, and to object to or restrict
            its processing. To exercise those rights, contact us using the
            details in our <Link href="/privacy">Privacy Policy</Link>.
          </p>

          <h2>Changes to this policy</h2>
          <p>
            We may update this Cookies Policy from time to time to reflect
            changes in the cookies we use, in our service, or in applicable law.
            The &ldquo;Last updated&rdquo; date at the top of this page
            indicates when the policy was most recently revised. Material
            changes — for example, introducing analytics or advertising cookies
            — will be accompanied by a clear notice on the site.
          </p>

          <h2>Contact</h2>
          <p>
            If you have questions about this Cookies Policy or about how
            TwitchMetrics uses cookies, please contact us via the channels
            listed in our <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </article>
      </div>
    </div>
  );
}
