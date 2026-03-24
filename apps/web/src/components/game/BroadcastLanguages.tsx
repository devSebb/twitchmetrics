import { Translate } from "@phosphor-icons/react/dist/ssr";

type Language = {
  language: string;
  label: string;
  percent: number;
};

type BroadcastLanguagesProps = {
  languages: Language[];
};

export function BroadcastLanguages({ languages }: BroadcastLanguagesProps) {
  const sorted = [...languages].sort((a, b) => b.percent - a.percent);

  return (
    <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-4">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[#F2F3F5]">
        <Translate size={16} weight="duotone" className="text-[#949BA4]" />
        Top Broadcast Languages
      </h2>

      {sorted.length === 0 ? (
        <p className="text-sm text-[#949BA4]">No data available</p>
      ) : (
        <div className="space-y-3">
          {sorted.map((lang) => (
            <div key={lang.language}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-[#DBDEE1]">{lang.label}</span>
                <span className="text-[#949BA4]">
                  {lang.percent.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#383A40]">
                <div
                  className="h-full rounded-full bg-[#E32C19]"
                  style={{ width: `${Math.min(lang.percent, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
