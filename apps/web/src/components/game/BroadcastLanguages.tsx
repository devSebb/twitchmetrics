import { InfoTip } from "@/components/shared/InfoTip";
import { GAME_INFO } from "@/lib/constants/metric-info";

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
    <div className="min-w-0">
      <h3 className="mb-4 flex items-center gap-2 text-xl font-bold tracking-tight text-n-ink">
        Top Broadcast Languages
        <InfoTip info={GAME_INFO.broadcastLanguages} />
      </h3>

      {sorted.length === 0 ? (
        <p className="text-sm text-n-slate">No data available</p>
      ) : (
        <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((lang) => (
            <div key={lang.language}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-n-ink">{lang.label}</span>
                <span className="text-n-slate">{lang.percent.toFixed(1)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-n-surface">
                <div
                  className="h-full rounded-full bg-n-navy"
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
