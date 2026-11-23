import {
  ActionLink,
  Container,
  SectionHeading,
} from "@/components/ui/Editorial";
const questions = [
  [
    "Is Noticed free for creators?",
    "Yes. Finding, claiming and sharing your creator media kit is free. Talent-manager tools and custom reports are separate offerings.",
  ],
  [
    "Where do the numbers come from?",
    "Profiles combine public platform metrics, Hatchet data and, where connected and authorised, first-party analytics. Sources, coverage and update times vary by metric and platform.",
  ],
  [
    "Who can see my media kit?",
    "Your public media kit is available to anyone with its link. Private account analytics remain subject to your sharing settings and permissions.",
  ],
  [
    "Do I need to keep it updated?",
    "Tracked metrics refresh as new data is collected. You control profile details and creator-entered information, including brand partnerships.",
  ],
  [
    "What if I cannot find my profile?",
    "Try your platform username or another spelling. Search can also suggest untracked Twitch channels. Create an account to use the supported claiming and connection flows.",
  ],
  [
    "Can I manage a roster here?",
    "Yes. Invite the creators you represent. They must accept and authorise access before you can see their permitted private analytics or include them in authorised exports.",
  ],
];
export function CtaSection() {
  return (
    <section className="pb-16 sm:pb-24" aria-labelledby="faq-title">
      <Container>
        <SectionHeading
          number="05"
          title="Questions, answered."
          id="faq-title"
        />
        {questions.map(([question, answer]) => (
          <details
            key={question}
            className="n-faq border-b border-n-line py-5 sm:py-6"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-6 text-lg font-bold tracking-tight sm:text-xl">
              {question}
            </summary>
            <p className="mt-4 max-w-3xl pr-8 text-base leading-relaxed text-n-slate">
              {answer}
            </p>
          </details>
        ))}
        <div className="mt-12 flex flex-wrap items-center justify-between gap-6">
          <p className="text-2xl font-bold tracking-tight">
            Your next introduction starts here.
          </p>
          <ActionLink href="#find-your-kit">Find my media kit</ActionLink>
        </div>
      </Container>
    </section>
  );
}
