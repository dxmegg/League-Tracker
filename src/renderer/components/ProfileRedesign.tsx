import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { AccountListItem, ChampionData, HomeTimePeriod } from "../../shared/api";
import { shortRegion } from "../../shared/regions";
import { useChampionData } from "../hooks/useChampions";
import { formatTimeAgo } from "../lib/format";
import { useScopedQueue } from "../lib/historyScope";
import type { ProfileData, ProfileRankedEntry } from "../lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChampionMasteryExp } from "./ChampionMasteryExp";
import { Panel } from "./Panel";
import { RankCardExp } from "./RankCardExp";
import { DEFAULT_SPLASH, SplashPicker, splashUrl, useSplashPref } from "./ProfileSplash";
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
  const queue = useScopedQueue(undefined);
  const champData = useChampionData();
  const [topChampionId, setTopChampionId] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);

  // Splash art of the most played champion for the current scope and mode.
  useEffect(() => {
    let cancelled = false;
    window.api
      .getHomeDashboard(activePuuid ?? "all", "full", queue)
      .then((data) => {
        if (cancelled) return;
        setTopChampionId(data.topChampions[0]?.championId ?? null);
        setStreak(data.summary.recentStreak);
      })
      .catch(() => {
        if (cancelled) return;
        setTopChampionId(null);
        setStreak(0);
      });
    return () => {
      cancelled = true;
    };
  }, [activePuuid, queue]);

  const {
    pref: splashPref,
    update: updateSplash,
    reset: resetSplash,
  } = useSplashPref(activePuuid ?? "all");
  const splashChampionId = splashPref?.championId ?? topChampionId;
  const splashKey = splashChampionId != null ? champData[splashChampionId]?.key : undefined;
  const art = { ...DEFAULT_SPLASH, ...splashPref };
  const isLive = mode === "single" && activePuuid !== null && activePuuid === livePuuid;
  const progress = totalCount > 0 ? Math.min(100, (scannedCount / totalCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <section
        className="relative flex min-h-[162px] flex-wrap items-center gap-6 rounded-[18px] border border-lol-border bg-[radial-gradient(900px_500px_at_85%_-8%,var(--theme-crimson-glow),transparent_70%),linear-gradient(to_bottom,var(--theme-bg-deep),var(--theme-bg-base))] p-6 shadow-[0_24px_60px_-28px_var(--theme-crimson-glow)]"
        style={
          splashKey
            ? {
                backgroundImage: `linear-gradient(90deg, var(--theme-bg-deep) 4%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.5) 100%), radial-gradient(720px 380px at 92% -12%, var(--theme-crimson-glow), transparent 70%), url(${splashUrl(splashKey, art.skin)})`,
                backgroundSize: `auto, auto, ${art.zoom}% auto`,
                backgroundPosition: `0 0, 0 0, ${art.x}% ${art.y}%`,
                backgroundRepeat: "no-repeat",
              }
            : undefined
        }
      >
        {mode === "single" ? (
          <div className="relative shrink-0">
            <SummonerIcon
              iconId={profileIconId}
              size={112}
              className="rounded-2xl border border-lol-crimson/40 bg-lol-dark object-cover"
            />
            <Badge
              variant="outline"
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border-lol-border bg-lol-card px-2.5 font-display text-[11px] font-bold text-lol-text-bright"
            >
              Lv {level ?? "—"}
            </Badge>
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
            {streak !== 0 && (
              <Badge
                variant="outline"
                className={`rounded-full px-2 py-px font-display text-[11px] font-bold ${
                  streak > 0
                    ? "border-lol-win/50 bg-lol-win/10 text-lol-win"
                    : "border-lol-loss/50 bg-lol-loss/10 text-lol-loss"
                }`}
              >
                {streak > 0 ? "W" : "L"}
                {Math.abs(streak)} streak
              </Badge>
            )}
          </div>
        </div>

        {mode === "single" && (
          <div className="flex shrink-0 flex-wrap gap-3">
            <RankCardExp compact title="Ranked Solo" entry={rankedSolo} />
            <RankCardExp compact title="Ranked Flex" entry={rankedFlex} />
          </div>
        )}

        <div className="flex shrink-0 flex-col items-end gap-2.5">
          <SplashPicker
            championId={splashChampionId}
            pref={splashPref}
            champData={champData}
            onChange={updateSplash}
            onReset={resetSplash}
          />
          <Tabs
            value={timePeriod}
            onValueChange={(period) => onTimePeriodChange(period as HomeTimePeriod)}
          >
            <TabsList className="h-auto rounded-[10px] border border-lol-border bg-lol-card p-[3px]">
              {TIME_PERIODS.map((period) => (
                <TabsTrigger
                  key={period}
                  value={period}
                  className="rounded-[7px] px-3 py-1 font-display text-[12px] font-semibold text-lol-text data-[state=active]:bg-lol-crimson data-[state=active]:text-white"
                >
                  {period === "full" ? "Full" : period}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button
            onClick={onRefresh}
            disabled={refreshing}
            className="h-auto rounded-lg bg-lol-crimson px-5 py-2 font-display text-[13px] font-semibold text-white transition-opacity hover:bg-lol-crimson hover:opacity-90 disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
          {refreshing && (
            <div className="flex w-56 flex-col items-end gap-1">
              <Progress
                value={progress}
                className="h-1.5 bg-lol-border/60"
                indicatorClassName="bg-lol-gold duration-300"
              />
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
              <Panel variant="tile">
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
              <Panel variant="tile" className="flex flex-col">
                <SectionTitle
                  aside={<span className="text-[13px] text-lol-text">{accounts.length} saved</span>}
                >
                  Most played accounts
                </SectionTitle>
                {/* Rows spread over the panel's full height, each with its share of the top account */}
                <div className="flex flex-1 flex-col justify-between gap-2">
                  {[...accounts]
                    .sort((a, b) => b.gameCount - a.gameCount)
                    .slice(0, 6)
                    .map((saved, rank, top) => {
                      const losses = saved.decidedGames - saved.wins;
                      const wr =
                        saved.decidedGames > 0 ? (saved.wins / saved.decidedGames) * 100 : 0;
                      return (
                        <div
                          key={saved.puuid}
                          className="rounded-xl bg-white/[0.04] px-3 py-2 transition-colors hover:bg-white/[0.08]"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-4 text-center font-display text-[12px] font-bold text-lol-text">
                              {rank + 1}
                            </span>
                            <SummonerIcon
                              iconId={saved.profileIconId}
                              size={34}
                              className="rounded-lg bg-lol-dark object-cover ring-1 ring-lol-border"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-display text-[13.5px] font-semibold text-lol-text-bright">
                                {saved.gameName ?? "Unknown"}
                                {saved.tagLine && (
                                  <span className="ml-1 font-medium text-lol-text">
                                    #{saved.tagLine}
                                  </span>
                                )}
                              </div>
                              <div className="font-display text-[11.5px] tabular-nums">
                                <span className="text-lol-win">{saved.wins}W</span>{" "}
                                <span className="text-lol-loss">{losses}L</span>
                                <span className="ml-2 text-lol-text">{saved.gameCount} games</span>
                              </div>
                            </div>
                            <b
                              className={`font-display text-[17px] tabular-nums ${wr >= 50 ? "text-lol-win" : "text-lol-loss"}`}
                            >
                              {wr.toFixed(0)}%
                            </b>
                          </div>
                          <Progress
                            value={(saved.gameCount / Math.max(1, top[0].gameCount)) * 100}
                            className="mt-2 h-1 bg-white/[0.06]"
                            indicatorClassName="rounded-full bg-lol-crimson"
                          />
                        </div>
                      );
                    })}{" "}
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
