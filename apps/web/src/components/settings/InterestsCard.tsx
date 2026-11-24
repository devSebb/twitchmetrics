"use client";

type InterestsCardProps = {
  interests: string[];
};

export function InterestsCard({ interests }: InterestsCardProps) {
  return (
    <div className="rounded-xl border border-n-line bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-n-ink">Interests</h3>
      </div>
      <div className="mt-3">
        {interests.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {interests.map((interest) => (
              <span
                key={interest}
                className="rounded-full border border-n-line bg-n-surface px-3 py-1 text-xs text-n-ink"
              >
                {interest}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-n-slate">
            No interests selected yet. Add interests in the form above.
          </p>
        )}
      </div>
    </div>
  );
}
