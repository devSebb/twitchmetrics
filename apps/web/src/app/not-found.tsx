import { Wordmark } from "@/components/brand/Wordmark";
import { ActionLink } from "@/components/ui/Editorial";
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[65vh] max-w-3xl flex-col items-start justify-center px-5 py-16 sm:px-8">
      <Wordmark />
      <p className="n-eyebrow mt-12 text-n-red">404 / Page unavailable</p>
      <h1 className="mt-5 text-5xl font-extrabold tracking-tight">
        We couldn’t find that page.
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-n-slate">
        The link may have changed, or this page may no longer be available.
        Explore channels and categories, or start again from the homepage.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <ActionLink href="/">Back to home</ActionLink>
        <ActionLink variant="secondary" href="/search">
          Search Noticed ↗
        </ActionLink>
      </div>
    </div>
  );
}
