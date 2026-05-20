import { Sparkle } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/widgets/EmptyState";

type InterestsSectionProps = {
  interests?: readonly string[] | null;
};

export function InterestsSection({ interests }: InterestsSectionProps) {
  const hasInterests = (interests?.length ?? 0) > 0;

  return (
    <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#F2F3F5]">
        <Sparkle size={16} weight="duotone" className="text-[#949BA4]" />
        Interests
      </h3>
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
    </div>
  );
}
