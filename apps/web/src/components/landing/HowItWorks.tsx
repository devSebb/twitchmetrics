import Link from "next/link";
import { Container, SectionHeading } from "@/components/ui/Editorial";
const steps = [
  {
    title: "Find your profile.",
    body: "Search your creator name. Your public stats may already be here, ready for you to claim.",
    href: "#find-your-kit",
    action: "Find my profile",
  },
  {
    title: "Make it yours.",
    body: "Verify ownership, connect supported accounts and add the partnerships that tell your story.",
    href: "/claim",
    action: "Claim a profile",
  },
  {
    title: "Share one link.",
    body: "Send your media kit to brands and collaborators. Tracked metrics refresh as new data arrives.",
    href: "/solutions/creators",
    action: "Explore creator tools",
  },
];
export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-title"
      className="py-16 sm:py-24"
    >
      <Container>
        <SectionHeading
          number="01"
          title="Less upkeep. More creating."
          id="how-it-works-title"
        />
        <div className="grid gap-9 md:grid-cols-3 md:gap-10">
          {steps.map((step, i) => (
            <div key={step.title}>
              <p
                className="text-6xl font-extrabold leading-none tracking-[-.05em] text-n-red"
                aria-hidden
              >
                0{i + 1}
              </p>
              <h3 className="mt-6 text-2xl font-bold tracking-tight">
                {step.title}
              </h3>
              <p className="mt-3 max-w-sm text-base leading-relaxed text-n-slate">
                {step.body}
              </p>
              <Link
                href={step.href}
                className="mt-5 inline-block py-2 text-sm font-semibold underline underline-offset-4"
              >
                {step.action}
              </Link>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
