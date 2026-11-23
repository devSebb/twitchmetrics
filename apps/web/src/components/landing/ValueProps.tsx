import { Container, SectionHeading } from "@/components/ui/Editorial";
const benefits = [
  [
    "Keeping numbers current",
    "Update and resend it yourself",
    "Tracked stats refresh automatically",
  ],
  [
    "Sharing your story",
    "A new file for every update",
    "One public link to your media kit",
  ],
  [
    "Understanding performance",
    "A snapshot of selected numbers",
    "Follower history and livestream analytics",
  ],
  [
    "Showing your audience",
    "Manually prepared summaries",
    "Available audience insights, with sources",
  ],
  [
    "Creator access",
    "Depends on the tool you choose",
    "Free to find, claim and share your kit",
  ],
];
export function ValueProps() {
  return (
    <section
      aria-labelledby="value-title"
      className="bg-n-surface py-16 sm:py-24"
    >
      <Container>
        <SectionHeading
          number="02"
          title="Your media kit should move with you."
          id="value-title"
        />
        <p className="mb-7 max-w-2xl text-base leading-relaxed text-n-slate">
          Your work keeps growing. Give brands a clearer view of it, with a
          public profile and the detail behind the numbers.
        </p>
        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Media kit comparison"
        >
          <table className="n-table min-w-[600px]">
            <caption className="sr-only">
              A static media kit compared with Noticed
            </caption>
            <thead>
              <tr>
                <th scope="col" className="w-[30%]">
                  What matters
                </th>
                <th scope="col" className="w-[33%]">
                  A static media kit
                </th>
                <th scope="col" className="text-n-ink">
                  <span className="text-2xl font-black tracking-tight">
                    noticed<span className="text-n-red">.</span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {benefits.map(([label, before, after]) => (
                <tr key={label}>
                  <th scope="row" className="!font-semibold !text-n-ink">
                    {label}
                  </th>
                  <td className="text-n-slate">{before}</td>
                  <td className="font-semibold">{after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-n-slate">
          Metrics and audience insights depend on the platform, available
          history and creator sharing settings.
        </p>
      </Container>
    </section>
  );
}
