import {
  Container,
  ActionLink,
  SectionHeading,
} from "@/components/ui/Editorial";

type Item = { title: string; body: string };
export function SolutionPage({
  audience,
  title,
  introduction,
  cta,
  features,
  steps,
  faqs,
}: {
  audience: string;
  title: string;
  introduction: string;
  cta: string;
  features: readonly Item[];
  steps: readonly Item[];
  faqs: readonly { question: string; answer: string }[];
}) {
  return (
    <div className="noticed">
      <header className="border-b border-n-line bg-n-surface">
        <Container className="py-16 sm:py-24">
          <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr] lg:items-end">
            <div>
              <p className="n-eyebrow text-n-slate">For {audience}</p>
              <h1 className="mt-6 max-w-3xl text-[clamp(3rem,6.5vw,6rem)] font-extrabold leading-[.98] tracking-[-.055em]">
                {title}
                <span className="text-n-red">.</span>
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-relaxed text-n-slate">
                {introduction}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ActionLink href="/register">{cta}</ActionLink>
                <ActionLink variant="secondary" href="#how-it-works">
                  See how it works ↓
                </ActionLink>
              </div>
            </div>
            <div className="border-t border-n-ink">
              <p className="n-eyebrow py-5 text-n-slate">
                Inside your workspace
              </p>
              {features.slice(0, 3).map((feature, index) => (
                <a
                  key={feature.title}
                  href="#workspace"
                  className="flex items-start gap-4 border-t border-n-line py-6 text-xl font-bold tracking-tight sm:text-2xl"
                >
                  <span className="pt-1 text-xs font-medium text-n-red">
                    0{index + 1}
                  </span>
                  {feature.title}
                  <span className="ml-auto" aria-hidden>
                    ↗
                  </span>
                </a>
              ))}
            </div>
          </div>
        </Container>
      </header>
      <section id="workspace" className="scroll-mt-24">
        <Container className="py-16 sm:py-20">
          <SectionHeading number="01" title="Make your work visible." />
          <div className="grid gap-x-12 gap-y-10 md:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="border-t border-n-line pt-6"
              >
                <h3 className="text-2xl font-bold leading-tight tracking-tight">
                  {feature.title}
                </h3>
                <p className="mt-4 text-base leading-relaxed text-n-slate">
                  {feature.body}
                </p>
              </article>
            ))}
          </div>
          <nav
            aria-label="Explore Noticed"
            className="mt-12 flex flex-wrap gap-3 border-t border-n-line pt-6"
          >
            <ActionLink variant="secondary" href="/creators">
              Explore channels ↗
            </ActionLink>
            <ActionLink variant="secondary" href="/browse">
              Explore categories ↗
            </ActionLink>
            <ActionLink variant="secondary" href="/reports">
              Explore reports ↗
            </ActionLink>
          </nav>
        </Container>
      </section>
      <section
        id="how-it-works"
        className="scroll-mt-24 border-y border-n-line bg-n-surface"
      >
        <Container className="py-16 sm:py-20">
          <SectionHeading number="02" title="From sign-up to sharing." />
          <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.title}>
                <p className="text-4xl font-extrabold tracking-tight text-n-red">
                  0{index + 1}
                </p>
                <h3 className="mt-5 text-xl font-bold">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-n-slate">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </Container>
      </section>
      <section>
        <Container className="py-16 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
            <div>
              <p className="n-eyebrow text-n-red">03 / The details</p>
              <h2 className="mt-4 text-4xl font-extrabold tracking-tight">
                Good to know.
              </h2>
            </div>
            <div className="border-t border-n-line">
              {faqs.map((faq) => (
                <details
                  key={faq.question}
                  className="group border-b border-n-line py-5"
                >
                  <summary className="cursor-pointer py-1 text-lg font-semibold">
                    {faq.question}
                  </summary>
                  <p className="mt-4 max-w-3xl text-base leading-relaxed text-n-slate">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </Container>
      </section>
      <section className="n-dark bg-n-ink text-white">
        <Container className="flex flex-wrap items-center justify-between gap-8 py-16">
          <h2 className="max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl">
            Ready to get noticed?
          </h2>
          <ActionLink href="/register">{cta} ↗</ActionLink>
        </Container>
      </section>
    </div>
  );
}
