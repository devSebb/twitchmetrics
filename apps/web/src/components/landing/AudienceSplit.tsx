import { ActionLink, Container } from "@/components/ui/Editorial";
export function AudienceSplit() {
  return (
    <section className="py-16 sm:py-24" aria-labelledby="agency-title">
      <Container>
        <div className="grid gap-10 rounded-2xl bg-n-navy p-7 text-white sm:p-12 lg:grid-cols-[1.1fr_1fr] lg:gap-20 lg:p-16">
          <div>
            <p className="n-eyebrow text-[#D2D5D7]">
              For talent managers and agencies
            </p>
            <h2
              id="agency-title"
              className="mt-5 text-[clamp(2rem,4vw,3.5rem)] font-extrabold leading-[1.05] tracking-[-.04em]"
            >
              Your talent.
              <br />
              The full picture.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-[#E6E8EB]">
              Bring the creators you represent into one workspace. Keep their
              profiles close, their permissions clear and their latest numbers
              ready to share.
            </p>
            <ActionLink
              href="/solutions/talent-managers"
              variant="light"
              className="mt-7"
            >
              Explore the manager workspace
            </ActionLink>
          </div>
          <div className="flex flex-col justify-center">
            {[
              [
                "Invite your creators",
                "Creators accept your invitation and authorise access.",
              ],
              [
                "See your roster together",
                "Review creator profiles and the analytics you have permission to see.",
              ],
              [
                "Prepare your next pitch",
                "Export roster reports as PDF or CSV with your agency branding.",
              ],
            ].map(([title, description]) => (
              <div key={title} className="border-t border-white/25 py-6">
                <h3 className="text-xl font-bold">{title}</h3>
                <p className="mt-2 text-base leading-relaxed text-[#D2D5D7]">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
