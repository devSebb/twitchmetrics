import { EmptyState } from "@/components/widgets/EmptyState";

type InterestsSectionProps = {
  interests?: readonly string[] | null;
};

export function InterestsSection({ interests }: InterestsSectionProps) {
  const hasInterests = (interests?.length ?? 0) > 0;

  return (
    <>
      {hasInterests ? (
        <ul className="flex flex-wrap gap-2">
          {interests!.map((interest) => (
            <li
              key={interest}
              className="rounded-full border border-[#3F4147] bg-[#383A40] px-3 py-1 text-xs font-medium text-[#DBDEE1]"
            >
              {interest}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          variant="no_data"
          title="Interests"
          message="No interests added yet."
          compact
        />
      )}
    </>
  );
}
