import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { AppearanceProvider } from "@/components/ui/Appearance";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppearanceProvider>
      <main
        id="main-content"
        className="noticed n-auth min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
      >
        <aside className="border-b border-n-line bg-n-surface px-6 py-8 sm:px-12 lg:flex lg:min-h-screen lg:flex-col lg:justify-between lg:border-b-0 lg:border-r lg:py-12">
          <Link
            href="/"
            aria-label="Noticed home"
            className="inline-flex w-fit"
          >
            <Wordmark />
          </Link>
          <div className="hidden max-w-xl py-16 lg:block">
            <p className="n-eyebrow text-n-slate">
              For creators. For the people behind them.
            </p>
            <h2 className="mt-6 text-[clamp(3rem,5vw,5.5rem)] font-extrabold leading-[.98] tracking-[-.055em]">
              Your work.
              <br />
              Your audience.
              <br />
              Get noticed<span className="text-n-red">.</span>
            </h2>
            <p className="mt-8 max-w-md text-lg leading-relaxed text-n-slate">
              Bring your creator profile, connected insights and talent roster
              into one place.
            </p>
          </div>
          <p className="hidden text-sm text-n-slate lg:block">
            Creator intelligence, powered by Hatchet.
          </p>
        </aside>
        <div className="flex items-center justify-center px-5 py-10 sm:px-10 lg:py-16">
          <div className="w-full max-w-lg">{children}</div>
        </div>
      </main>
    </AppearanceProvider>
  );
}
