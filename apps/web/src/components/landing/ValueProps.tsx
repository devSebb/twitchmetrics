import { Card } from "@/components/ui/Card";

const FEATURES = [
  {
    title: "Cross-Platform Stats",
    description:
      "Aggregate follower counts, viewer metrics, and growth trends from Twitch, YouTube, TikTok, and more — all in one place.",
  },
  {
    title: "Media Kit Generation",
    description:
      "Auto-generate a professional media kit from your analytics. Share your reach and engagement with potential sponsors instantly.",
  },
  {
    title: "Brand Partnerships",
    description:
      "Showcase past collaborations and attract new brand deals. Let your track record speak for itself.",
  },
] as const;

function FeatureIcon({ index }: { index: number }) {
  const icons = ["📊", "📄", "🤝"];
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#E32C19]/10 text-lg">
      {icons[index]}
    </div>
  );
}

export function ValueProps() {
  return (
    <section className="bg-[#1E1F22] py-20">
      <div className="mx-auto max-w-6xl px-6">
        {/* Your Creator Profile */}
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="relative aspect-video overflow-hidden rounded-xl border border-[#3F4147] bg-[#313338]">
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-[#E32C19]/20" />
                <div className="mx-auto h-3 w-32 rounded bg-[#383A40]" />
                <div className="mx-auto mt-2 h-2 w-48 rounded bg-[#383A40]/60" />
                <div className="mx-auto mt-4 grid grid-cols-3 gap-3 px-8">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 rounded bg-[#383A40]/40" />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-bold text-[#F2F3F5]">
              Your Creator Profile
            </h2>
            <p className="mt-4 text-[#949BA4] leading-relaxed">
              Your content deserves more than scattered analytics. Get a
              sharable profile that shows who you are as a creator — audience
              reach, activity, and performance — all presented in a single
              visual overview.
            </p>
            <p className="mt-3 text-[#949BA4] leading-relaxed">
              Perfect for partnerships, personal insights, or just understanding
              your growth.
            </p>
          </div>
        </div>

        {/* Talent Manager Dashboard */}
        <div className="mt-24 grid items-center gap-12 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <h2 className="text-3xl font-bold text-[#F2F3F5]">
              Talent Manager Dashboard
            </h2>
            <p className="mt-4 text-[#949BA4] leading-relaxed">
              Built for teams managing creators. View your full roster, explore
              individual performance, export creator data, and filter by what
              matters most.
            </p>
          </div>
          <div className="relative order-1 aspect-video overflow-hidden rounded-xl border border-[#3F4147] bg-[#313338] lg:order-2">
            <div className="flex h-full items-center justify-center">
              <div className="w-full px-6">
                <div className="mb-3 h-3 w-24 rounded bg-[#383A40]" />
                {[1, 2, 3].map((i) => (
                  <div key={i} className="mt-2 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-[#383A40]" />
                    <div className="h-2.5 flex-1 rounded bg-[#383A40]/60" />
                    <div className="h-2.5 w-16 rounded bg-[#383A40]/40" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* One Simple Tool */}
        <div className="mt-24 text-center">
          <h2 className="text-3xl font-bold text-[#F2F3F5]">One Simple Tool</h2>
          <p className="mx-auto mt-4 max-w-xl text-[#949BA4]">
            Everything you need to understand your talent — without spreadsheets
            or guesswork. Simple tools. Real visibility.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, i) => (
              <Card key={feature.title} className="text-left">
                <FeatureIcon index={i} />
                <h3 className="mt-4 text-base font-semibold text-[#F2F3F5]">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#949BA4]">
                  {feature.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
