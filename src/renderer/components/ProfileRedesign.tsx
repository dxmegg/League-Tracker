import type { ReactNode } from "react";
import type { AccountListItem, ChampionData, HomeTimePeriod } from "../../shared/api";
import { shortRegion } from "../../shared/regions";
import { formatTimeAgo } from "../lib/format";
import type { ProfileData, ProfileRankedEntry } from "../lib/types";
import { ChampionMasteryExp } from "./ChampionMasteryExp";
import { Panel } from "./Panel";
import { RankCardExp } from "./RankCardExp";
import SummonerIcon from "./SummonerIcon";
import { YourProfileSections } from "./YourProfileSections";

const LABEL = "font-display text-[10px] font-bold uppercase tracking-widest text-lol-text";
const TIME_PERIODS: HomeTimePeriod[] = ["24h", "7d", "30d", "full"];

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="font-display text-[16px] font-semibold text-lol-text-bright">
        <span className="mr-2 inline-block h-1.5 w-1.5 rotate-45 bg-lol-crimson align-middle" />
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function ProfileHeaderRedesign({
  mode,
  gameName,
  tagLine,
  profileIconId,
  level,
  platform,
  lastSeen,
  rankedSolo,
  rankedFlex,
  accounts,
  activePuuid,
  livePuuid,
  onSelectAccount,
  onRefresh,
  refreshing,
  scannedCount,
  totalCount,
  syncError,
  onDismissError,
  timePeriod,
  onTimePeriodChange,
}: {
  mode: "single" | "all";
  gameName: string;
  tagLine: string | null;
  profileIconId: number | null;
  level: number | null;
  platform: string | null;
  lastSeen: number | null;
  rankedSolo: ProfileRankedEntry | null;
  rankedFlex: ProfileRankedEntry | null;
  accounts: AccountListItem[];
  // null means the "All accounts" view
  activePuuid: string | null;
  livePuuid: string | null;
  onSelectAccount: (puuid: string | null) => void;
  onRefresh: () => void;
  refreshing: boolean;
  scannedCount: number;
  totalCount: number;
  syncError: string | null;
  onDismissError: () => void;
  // One period drives every section of the page
  timePeriod: HomeTimePeriod;
  onTimePeriodChange: (period: HomeTimePeriod) => void;
}) {
  const isLive = mode === "single" && activePuuid !== null && activePuuid === livePuuid;
  const progress = totalCount > 0 ? Math.min(100, (scannedCount / totalCount) * 100) : 0;
  const sortedAccounts = [...accounts].sort((a, b) => {
    const aLive = a.puuid === livePuuid ? 1 : 0;
    const bLive = b.puuid === livePuuid ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;
    return (b.lastSeen ?? 0) - (a.lastSeen ?? 0);
  });

  return (
    <div className="flex flex-col gap-3">
      <section className="flex min-h-[162px] flex-wrap items-center gap-6 rounded-[18px] border border-lol-border bg-[radial-gradient(900px_500px_at_85%_-8%,var(--theme-crimson-glow),transparent_70%),linear-gradient(to_bottom,var(--theme-bg-deep),var(--theme-bg-base))] p-6">
        {mode === "single" ? (
          <div className="relative shrink-0">
            <SummonerIcon
              iconId={profileIconId}
              size={112}
              className="rounded-2xl border border-lol-crimson/40 bg-lol-dark object-cover"
            />
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-lol-border bg-lol-card px-2.5 py-0.5 font-display text-[11px] font-bold text-lol-text-bright">
              Lv {level ?? "—"}
            </span>
          </div>
        ) : (
          <div className="flex shrink-0 -space-x-3">
            {accounts.slice(0, 5).map((account) => (
              <SummonerIcon
                key={account.puuid}
                iconId={account.profileIconId}
                size={56}
                className="rounded-xl border-2 border-lol-card bg-lol-dark object-cover"
              />
            ))}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className={LABEL}>
            {mode === "single" ? "Your profile" : "Your profile · combined"}
          </div>
          <h1 className="mt-1 font-display text-[32px] font-bold leading-tight text-lol-text-bright">
            {mode === "single" ? gameName : "All accounts"}
            {mode === "single" && tagLine && (
              <small className="ml-1.5 font-display text-[20px] font-medium text-lol-text">
                #{tagLine}
              </small>
            )}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-lol-text">
            {mode === "single" ? (
              <>
                <span>Region {shortRegion(platform)}</span>
                {isLive ? (
                  <span className="inline-flex items-center gap-1.5 font-display font-semibold text-lol-win">
                    <span className="h-1.5 w-1.5 rounded-full bg-lol-win" />
                    Live
                  </span>
                ) : (
                  lastSeen && <span>Synced {formatTimeAgo(lastSeen)}</span>
                )}
              </>
            ) : (
              <span>{accounts.length} saved accounts</span>
            )}
          </div>
        </div>

        {mode === "single" && (
          <div className="flex shrink-0 flex-wrap gap-3">
            <RankCardExp compact title="Ranked Solo" entry={rankedSolo} />
            <RankCardExp compact title="Ranked Flex" entry={rankedFlex} />
          </div>
        )}

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="inline-flex rounded-[10px] border border-lol-border bg-lol-card p-[3px]">
            {TIME_PERIODS.map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => onTimePeriodChange(period)}
                className={`rounded-[7px] px-3 py-1 font-display text-[12px] font-semibold transition-colors ${
                  period === timePeriod
                    ? "bg-lol-crimson text-white"
                    : "text-lol-text hover:text-lol-text-bright"
                }`}
              >
                {period === "full" ? "Full" : period}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded-lg bg-lol-crimson px-5 py-2 font-display text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          {refreshing && (
            <div className="flex w-56 flex-col items-end gap-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-lol-border/60">
                <div
                  className="h-full bg-lol-gold transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[11px] tabular-nums text-lol-text">
                {scannedCount} out of {totalCount || "?"} games scanned
              </span>
            </div>
          )}
        </div>
      </section>

      {syncError && (
        <div className="flex items-start gap-3 rounded-lg border border-lol-crimson/40 bg-lol-crimson/10 px-4 py-3">
          <span className="text-sm font-bold text-lol-crimson-bright">!</span>
          <p className="flex-1 text-xs text-lol-crimson-bright">{syncError}</p>
          <button
            type="button"
            onClick={onDismissError}
            className="shrink-0 text-xs font-bold uppercase tracking-wider text-lol-crimson-bright transition-colors hover:text-lol-text-bright"
            aria-label="Dismiss sync error"
          >
            Dismiss
          </button>
        </div>
      )}

      <div
        className="scroll-themed flex gap-2 overflow-x-auto pb-2"
        role="tablist"
        aria-label="Accounts"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "all"}
          onClick={() => onSelectAccount(null)}
          className={`shrink-0 rounded-lg border px-4 py-2 font-display text-[12px] font-semibold transition-colors ${
            mode === "all"
              ? "border-lol-crimson/60 bg-lol-crimson/20 text-lol-text-bright"
              : "border-lol-border bg-lol-card text-lol-text hover:text-lol-text-bright"
          }`}
        >
          All accounts
        </button>
        {sortedAccounts.map((account) => {
          const selected = mode === "single" && account.puuid === activePuuid;
          return (
            <button
              key={account.puuid}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelectAccount(account.puuid)}
              className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors ${
                selected
                  ? "border-lol-crimson/60 bg-lol-crimson/20 text-lol-text-bright"
                  : "border-lol-border bg-lol-card text-lol-text hover:text-lol-text-bright"
              }`}
            >
              <SummonerIcon
                iconId={account.profileIconId}
                size={24}
                className="rounded-md bg-lol-dark object-cover"
              />
              <span className="max-w-[140px] truncate font-display text-[12px] font-semibold">
                {account.gameName ?? "Unknown"}
              </span>
              {account.puuid === livePuuid && (
                <span className="h-1.5 w-1.5 rounded-full bg-lol-win" aria-label="Live" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ProfileRedesign({
  header,
  profile,
  error,
  account,
  timePeriod,
  champData,
  accounts,
}: {
  header: ReactNode;
  accounts: AccountListItem[];
  profile: ProfileData | null;
  error: string | null;
  // "all" aggregates every tracked account; null means no account is available yet
  account: string | null;
  timePeriod: HomeTimePeriod;
  champData: ChampionData;
}) {
  const single = account !== null && account !== "all";

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      {header}

      {single && !profile && error && (
        <p className="rounded-lg border border-lol-crimson/40 bg-lol-crimson/10 p-3 text-sm text-lol-crimson-bright">
          {error}
        </p>
      )}

      {account !== null ? (
        <YourProfileSections
          account={account}
          timePeriod={timePeriod}
          champData={champData}
          // Always a panel, so the row keeps its height across accounts and while loading
          leading={
            single ? (
              <Panel>
                <SectionTitle
                  aside={
                    <span className="text-[13px] text-lol-text">
                      {profile?.topMasteryChampions?.length ?? 0} champions
                    </span>
                  }
                >
                  Champion mastery
                </SectionTitle>
                {profile ? (
                  <ChampionMasteryExp
                    rows={profile.topMasteryChampions ?? []}
                    champData={champData}
                  />
                ) : (
                  <p className="py-6 text-center text-sm text-lol-text">Loading…</p>
                )}
              </Panel>
            ) : (
              <Panel>
                <SectionTitle
                  aside={<span className="text-[13px] text-lol-text">{accounts.length} saved</span>}
                >
                  Most played accounts
                </SectionTitle>
                <div className="flex flex-col gap-2">
                  {[...accounts]
                    .sort((a, b) => b.gameCount - a.gameCount)
                    .slice(0, 5)
                    .map((saved) => (
                      <div key={saved.puuid} className="flex items-center gap-2.5">
                        <SummonerIcon
                          iconId={saved.profileIconId}
                          size={32}
                          className="rounded-lg bg-lol-dark object-cover"
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-lol-text-bright">
                          {saved.gameName ?? "Unknown"}
                          {saved.tagLine && (
                            <span className="ml-1 text-lol-text">#{saved.tagLine}</span>
                          )}
                        </span>
                        <span className="text-[12px] tabular-nums text-lol-text">
                          {saved.gameCount} games
                        </span>
                      </div>
                    ))}
                </div>
              </Panel>
            )
          }
        />
      ) : (
        <p className="py-8 text-center text-sm text-lol-text">No account data yet.</p>
      )}
    </div>
  );
}
