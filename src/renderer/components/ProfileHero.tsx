import SummonerIcon from "./SummonerIcon";

export function ProfileHero({
  gameName,
  tagLine,
  profileIconId,
  level,
  platform,
  isLive,
  onRefresh,
  refreshing,
}: {
  gameName: string;
  tagLine: string | null;
  profileIconId: number | null;
  level: number | null;
  platform: string | null;
  isLive: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-6">
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-2xl p-[5px] shadow-[0_0_0_2px_var(--theme-gold),0_0_0_5px_var(--theme-card),0_0_40px_rgba(230,188,99,0.18)]">
          <SummonerIcon
            iconId={profileIconId}
            size={112}
            className="rounded-xl bg-lol-card object-cover"
          />
        </div>
        <span className="font-display text-[12.5px] font-semibold text-lol-text">
          Level {level ?? "—"}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-[30px] font-bold leading-tight text-lol-text-bright">
          {gameName}
          {tagLine && (
            <small className="ml-1 font-display text-[22px] font-medium text-lol-text">
              #{tagLine}
            </small>
          )}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-lol-text">
          <span>Region {platform ? platform.toUpperCase() : "—"}</span>
          {isLive && (
            <span className="inline-flex items-center gap-1.5 font-display text-[13px] font-semibold text-lol-win">
              <span className="h-2 w-2 rounded-full bg-lol-win" />
              Live
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="ml-auto shrink-0 rounded-lg border border-lol-border bg-lol-card px-4 py-2 text-sm font-medium text-lol-text-bright transition-colors hover:border-lol-crimson disabled:opacity-50"
      >
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
