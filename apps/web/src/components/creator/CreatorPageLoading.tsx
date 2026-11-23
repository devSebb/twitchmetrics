import { Container } from "@/components/ui/Editorial";

export default function CreatorPageLoading() {
  return (
    <div className="noticed min-h-[70vh]" aria-busy="true">
      <Container className="py-16">
        <p role="status" className="n-eyebrow text-n-slate">
          Loading creator information…
        </p>
        <div aria-hidden="true" className="mt-8 space-y-8 animate-pulse">
          <div className="h-16 w-3/4 max-w-xl rounded bg-n-surface" />
          <div className="h-6 w-1/2 rounded bg-n-surface" />
          <div className="h-72 border-y border-n-line bg-n-surface/50" />
        </div>
      </Container>
    </div>
  );
}
