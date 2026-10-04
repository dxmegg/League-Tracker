import type { ProfileRankedEntry } from "../../shared/api";

export function RankCardExp({
  title,
  entry,
  isLive,
}: {
  title: string;
  entry: ProfileRankedEntry | null;
  isLive: boolean;
}) {
  const unranked = !entry || !entry.tier;

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-lol-border bg-[linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-5">
      <svg width="54" height="54" viewBox="0 0 54 54" aria-hidden="true" className="shrink-0">
        <path
          d="M27 3l21 12v24L27 51 6 39V15z"
          fill="none"
          stroke={unranked ? "var(--theme-foreground-subtle)" : "var(--theme-gold)"}
          strokeWidth="2"
          strokeDasharray={unranked ? "4 4" : "0"}
        />
      </svg>
      <div className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-medium uppercase tracking-wider text-lol-text/60">
          {title}
        </span>
        <b className="block font-display text-[20px] font-semibold text-lol-text-bright">
          {unranked ? "Unranked" : `${entry.tier} ${entry.rank ?? ""}`}
        </b>
        <span className="text-[13px] text-lol-text">
          {unranked
            ? "Your rank appears here once you play ranked."
            : isLive
              ? `${entry.leaguePoints ?? 0} LP · ${entry.wins ?? 0}W ${entry.losses ?? 0}L`
              : "Login to sync"}
        </span>
      </div>
    </div>
  );
}
