"use client";

type InterestsCardProps = {
  interests: string[];
};

export function InterestsCard({ interests }: InterestsCardProps) {
  return (
    <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#F2F3F5]">Interests</h3>
      </div>
      <div className="mt-3">
        {interests.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {interests.map((interest) => (
              <span
                key={interest}
                className="rounded-full border border-[#3F4147] bg-[#383A40] px-3 py-1 text-xs text-[#DBDEE1]"
              >
                {interest}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#949BA4]">
            No interests selected yet. Add interests in the form above.
          </p>
        )}
      </div>
    </div>
  );
}
