import { useEffect, useState } from "react";
import type { ReactNode, SVGProps } from "react";
import { Link } from "react-router-dom";
import { useActiveMode } from "../hooks/useActiveMode";
import type {
  AccountListItem,
  HomeAccountFilter,
  HomeDashboardPayload,
  HomeTimePeriod,
  LiveGameData,
  MatchListItem,
  TeammateStats,
} from "../../shared/api";
import {
  QUEUE_SCOPE_ARAM,
  QUEUE_SCOPE_ARENA,
  QUEUE_SCOPE_MAYHEM,
  QUEUE_SCOPE_NORMAL,
  QUEUE_SCOPE_RANKED,
} from "../../shared/queues";
import { getChampionName, useChampionData } from "../hooks/useChampions";
import { useLcuStatus } from "../hooks/useLcuStatus";
import { formatNumber } from "../lib/format";
import AugmentIcon from "./AugmentIcon";
import { parseAugmentIds } from "./AugmentGrid";
import ChampionIcon from "./ChampionIcon";
import ItemIcon from "./ItemIcon";
import SummonerIcon from "./SummonerIcon";
import {
  ChevronRightIcon,
  CoinsIcon,
  MedalIcon,
  SwordsIcon,
  TrendingUpIcon,
  TrophyIcon,
  UsersIcon,
  ZapIcon,
} from "./icons";

type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactNode;

const TIME_PERIODS: HomeTimePeriod[] = ["24h", "7d", "30d", "full"];

// Each mode pairs the queue filter with the history route that lists the same games.
const MODES: Array<{ label: string; queue: number | undefined; to: string }> = [
  { label: "All", queue: undefined, to: "/history" },
  { label: "Ranked", queue: QUEUE_SCOPE_RANKED, to: "/history/ranked" },
  { label: "Normal", queue: QUEUE_SCOPE_NORMAL, to: "/history/normal" },
  { label: "Arena", queue: QUEUE_SCOPE_ARENA, to: "/history/arena" },
  { label: "ARAM", queue: QUEUE_SCOPE_ARAM, to: "/history/aram" },
  { label: "Mayhem", queue: QUEUE_SCOPE_MAYHEM, to: "/history/mayhem" },
];

const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

const HUB: Array<{ to: string; title: string; text: string; Icon: IconComponent }> = [
  { to: "/records", title: "Records", text: "Your personal peaks", Icon: TrophyIcon },
  { to: "/history", title: "Match History", text: "Revisit every game", Icon: SwordsIcon },
  { to: "/champions", title: "Champions", text: "Per-champion results", Icon: MedalIcon },
  { to: "/trends", title: "Trends", text: "How your play shifts", Icon: TrendingUpIcon },
  { to: "/friends", title: "Friends", text: "Who you play with", Icon: UsersIcon },
];

const LIVE_MODE_LABEL: Record<string, string> = {
  KIWI: "ARAM Mayhem",
  ARAM: "ARAM",
  CLASSIC: "Classic",
};

const LABEL = "font-display text-[10px] font-bold uppercase tracking-widest text-lol-text";
const LINK_BUTTON =
  "rounded-md border border-lol-border px-3 py-1 text-[12px] font-semibold text-lol-text-bright transition-colors hover:border-lol-crimson/50";

function compact(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : `${Math.round(value)}`;
}

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
}

// game_version looks like "16.5.123.4567"; the patch is the first two segments
function patchOf(version: string | null | undefined): string | null {
  if (!version) return null;
  const [major, minor] = version.split(".");
  return minor ? `${major}.${minor}` : major;
}

function HubCard({
  title,
  to,
  linkLabel,
  className = "",
  children,
}: {
  title: string;
  to: string;
  linkLabel: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col rounded-[14px] border border-lol-border bg-[var(--theme-card)] p-5 ${className}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="font-display text-[10px] font-bold uppercase tracking-widest text-lol-gold">
          {title}
        </span>
        <Link
          to={to}
          className="text-[12px] font-semibold text-lol-text transition-colors hover:text-lol-text-bright"
        >
          {linkLabel} →
        </Link>
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

function StatRow({
  label,
  value,
  championId,
}: {
  label: string;
  value: string;
  championId?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-lol-border/40 py-1.5 last:border-b-0">
      <span className="flex items-center gap-2 text-[12px] text-lol-text">
        {championId ? <ChampionIcon championId={championId} size={18} className="rounded" /> : null}
        {label}
      </span>
      <b className="font-display text-[14px] font-bold text-lol-text-bright">{value}</b>
    </div>
  );
}

export function HomeRedesign({
  account,
  queue,
  onQueueChange,
  timePeriod,
  onTimePeriodChange,
  dashboard,
  loading,
  liveGame,
  savedAccounts,
}: {
  account: HomeAccountFilter;
  queue: number | undefined;
  onQueueChange: (queue: number | undefined) => void;
  timePeriod: HomeTimePeriod;
  onTimePeriodChange: (period: HomeTimePeriod) => void;
  dashboard: HomeDashboardPayload | null;
  loading: boolean;
  liveGame: LiveGameData | null;
  savedAccounts: AccountListItem[];
}) {
  const champData = useChampionData();
  const lcuStatus = useLcuStatus();
  const [dataMode] = useActiveMode();
  const isMayhem = dataMode === "mayhem";
  const [lastMatch, setLastMatch] = useState<MatchListItem | null>(null);
  const [allTimeGames, setAllTimeGames] = useState(0);
  const [friends, setFriends] = useState<TeammateStats[]>([]);

  const mode = MODES.find((m) => m.queue === queue) ?? MODES[0];
  const modeName = mode.queue === undefined ? "all modes" : mode.label;

  useEffect(() => {
    let cancelled = false;
    window.api
      .getHomeMatchList(account, queue, 1)
      .then((payload) => {
        if (!cancelled) setLastMatch(payload.matches[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setLastMatch(null);
      });
    return () => {
      cancelled = true;
    };
  }, [account, queue]);

  // The period toggle narrows the dashboard, but a milestone counts the whole library.
  useEffect(() => {
    let cancelled = false;
    window.api
      .getHomeDashboard(account, "full", queue)
      .then((data) => {
        if (!cancelled) setAllTimeGames(data.summary.totalGames);
      })
      .catch(() => {
        if (!cancelled) setAllTimeGames(0);
      });
    return () => {
      cancelled = true;
    };
  }, [account, queue]);

  useEffect(() => {
    let cancelled = false;
    window.api
      .getTeammateStats(queue, "friends")
      .then((rows) => {
        if (!cancelled) setFriends([...rows].sort((a, b) => b.games - a.games).slice(0, 4));
      })
      .catch(() => {
        if (!cancelled) setFriends([]);
      });
    return () => {
      cancelled = true;
    };
  }, [queue]);

  // account is a puuid, "all" or undefined; only a puuid we actually know counts as a specific pick
  const selectedAccount =
    typeof account === "string" && account !== "all"
      ? (savedAccounts.find((item) => item.puuid === account) ?? null)
      : null;

  const summary = dashboard?.summary;
  const records = dashboard?.records;
  const games = summary?.totalGames ?? 0;
  const wins = summary?.wins ?? 0;
  const losses = summary?.losses ?? 0;
  const winRate = games > 0 ? (wins / games) * 100 : 0;
  const avgKda = summary?.avgKda ?? 0;
  const avgDamage = summary?.statsEligibleGames ? compact(summary.avgDamageDealt) : "—";
  const periodText = timePeriod === "full" ? "all time" : `last ${timePeriod}`;
  const connected = lcuStatus === "connected" || lcuStatus === "ingame";
  const lastMatchLink = lastMatch ? `/match/${lastMatch.game_id}` : "/history";
  const lastMatchItems = lastMatch
    ? [
        lastMatch.item0,
        lastMatch.item1,
        lastMatch.item2,
        lastMatch.item3,
        lastMatch.item4,
        lastMatch.item5,
      ].filter((id): id is number => Boolean(id))
    : [];
  const lastMatchAugments = lastMatch ? parseAugmentIds(lastMatch.augment_ids) : [];
  const recentForm = [...(summary?.recentForm ?? [])].slice(0, 20).reverse();
  const topChampions = (dashboard?.topChampions ?? []).slice(0, 3);
  const nextMilestone = MILESTONES.find((m) => m > allTimeGames) ?? null;
  const milestonePct = nextMilestone ? Math.min(100, (allTimeGames / nextMilestone) * 100) : 100;

  const quickLaunch: Array<{ to: string; label: string; Icon: IconComponent }> = [
    { to: lastMatchLink, label: "Last Match", Icon: SwordsIcon },
    { to: "/champions", label: "Champions", Icon: MedalIcon },
    { to: "/items", label: "Items", Icon: CoinsIcon },
    { to: "/runes", label: "Runes", Icon: ZapIcon },
    { to: "/records", label: "Records", Icon: TrophyIcon },
    { to: "/trends", label: "Trends", Icon: TrendingUpIcon },
  ].filter((tile) => !(isMayhem && tile.to === "/runes"));

  return (
    <div
      className={`mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5 transition-opacity ${loading ? "opacity-70" : ""}`}
    >
      {/* 1. Hero: headline, quick launch, current focus */}
      <section className="grid grid-cols-1 gap-5 rounded-[18px] border border-lol-border bg-[radial-gradient(900px_500px_at_85%_-8%,var(--theme-crimson-glow),transparent_70%),linear-gradient(to_bottom,var(--theme-bg-deep),var(--theme-bg-base))] p-6 lg:grid-cols-[1.2fr_1fr_300px]">
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          {selectedAccount ? (
            <>
              <SummonerIcon
                iconId={selectedAccount.profileIconId ?? null}
                size={140}
                className="rounded-2xl border border-lol-crimson/40 bg-lol-dark object-cover"
              />
              <div>
                <div className="font-display text-[22px] font-bold text-lol-text-bright">
                  {selectedAccount.gameName ?? "Unknown"}
                </div>
                {selectedAccount.tagLine && (
                  <div className="text-[13px] text-lol-text">#{selectedAccount.tagLine}</div>
                )}
              </div>
            </>
          ) : (
            <>
              {savedAccounts.length === 0 ? (
                <SummonerIcon
                  iconId={null}
                  size={96}
                  className="rounded-2xl border border-lol-border bg-lol-dark object-cover"
                />
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {savedAccounts.slice(0, 9).map((saved) => (
                    <SummonerIcon
                      key={saved.puuid}
                      iconId={saved.profileIconId ?? null}
                      size={56}
                      className="rounded-xl border border-lol-border bg-lol-dark object-cover"
                    />
                  ))}
                </div>
              )}
              <div>
                <div className="font-display text-[22px] font-bold text-lol-text-bright">
                  All Accounts
                </div>
                <div className="text-[13px] text-lol-text">
                  {savedAccounts.length} {savedAccounts.length === 1 ? "Account" : "Accounts"}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="rounded-[14px] border border-lol-border bg-black/30 p-4 backdrop-blur">
          <div className={`${LABEL} mb-3`}>Quick launch / Jump in</div>
          <div className="grid grid-cols-3 gap-2">
            {quickLaunch.map(({ to, label, Icon }) => (
              <Link
                key={label}
                to={to}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-lol-border bg-lol-card px-2 py-3 text-center transition-colors hover:border-lol-crimson/50"
              >
                <Icon className="h-5 w-5 text-lol-crimson" />
                <span className="font-display text-[11px] font-semibold text-lol-text-bright">
                  {label}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-[14px] border border-lol-border bg-black/30 p-5 backdrop-blur">
          <div className={`flex items-center gap-2 ${LABEL}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-lol-win" />
            Current focus
            <span className="text-lol-text-bright">{mode.label}</span>
          </div>
          <div className="mt-3 font-display text-[44px] font-bold leading-none text-lol-text-bright">
            {formatNumber(games)}
          </div>
          <div className="mt-1 text-[12px] text-lol-text">tracked matches, {periodText}</div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-lol-border/50 pt-4">
            <div>
              <div className={LABEL}>Win rate</div>
              <div className="font-display text-[22px] font-bold text-lol-text-bright">
                {games > 0 ? `${winRate.toFixed(1)}%` : "—"}
              </div>
            </div>
            <div>
              <div className={LABEL}>Avg KDA</div>
              <div className="font-display text-[22px] font-bold text-lol-text-bright">
                {games > 0 ? avgKda.toFixed(2) : "—"}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Mode and period filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Mayhem mode pins the queue globally, so the per-queue buttons are hidden */}
        <div className="flex flex-wrap items-center gap-2">
          {(isMayhem ? [] : MODES).map((m) => (
            <button
              key={m.label}
              type="button"
              onClick={() => onQueueChange(m.queue)}
              className={`rounded-lg border px-4 py-2 font-display text-[12px] font-semibold transition-colors ${
                m.queue === queue
                  ? "border-lol-crimson/60 bg-lol-crimson/20 text-lol-text-bright"
                  : "border-lol-border bg-lol-card text-lol-text hover:text-lol-text-bright"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
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
      </div>

      {/* 3. Win record banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-lol-border bg-[var(--theme-card)] px-5 py-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-display text-[10px] font-bold uppercase tracking-widest text-lol-gold">
            Your record
          </span>
          <span className="font-display text-[15px] font-semibold text-lol-text-bright">
            {formatNumber(wins)}W – {formatNumber(losses)}L
            {games > 0 ? `, ${Math.round(winRate)}% winrate` : ""}
          </span>
          <span className="text-[12px] text-lol-text">
            {formatNumber(games)} games, {periodText}
          </span>
        </div>
        <Link to="/data" className={LINK_BUTTON}>
          Open stats →
        </Link>
      </div>

      {/* 4. Four-column stats and quick access grid; Trends spans both rows in column 4 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 lg:grid-rows-[auto_auto]">
        <HubCard title="Latest match" to={lastMatchLink} linkLabel="Detailed analysis">
          {lastMatch ? (
            <div className="flex items-center gap-3">
              <ChampionIcon championId={lastMatch.champion_id} size={48} className="rounded-lg" />
              <div className="min-w-0">
                <div className="truncate font-display text-[17px] font-bold text-lol-text-bright">
                  {getChampionName(champData, lastMatch.champion_id)}
                </div>
                <div className="text-[12px] text-lol-text">
                  <span className={lastMatch.win ? "text-lol-win" : "text-lol-loss"}>
                    {lastMatch.win ? "Victory" : "Defeat"}
                  </span>
                  {" · "}
                  {lastMatch.kills}/{lastMatch.deaths}/{lastMatch.assists}
                  {" · "}
                  {formatDuration(lastMatch.game_duration)}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[13px] text-lol-text">No matches recorded yet.</div>
          )}
        </HubCard>

        <HubCard title="Champions" to="/champions" linkLabel="Open champions">
          {topChampions.length > 0 ? (
            <div className="flex flex-col gap-2">
              {topChampions.map((champion) => (
                <div key={champion.championId} className="flex items-center gap-2.5">
                  <ChampionIcon championId={champion.championId} size={28} className="rounded-md" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-lol-text-bright">
                    {getChampionName(champData, champion.championId)}
                  </span>
                  <span className="text-[12px] text-lol-text">
                    {champion.games}g · {Math.round(champion.winRate * 100)}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[13px] text-lol-text">No champions in this period.</div>
          )}
        </HubCard>

        <HubCard title="Items & builds" to="/items" linkLabel="Open items">
          {lastMatchItems.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {lastMatchItems.map((itemId, i) => (
                  <ItemIcon key={i} itemId={itemId} size={30} patch={lastMatch?.game_version} />
                ))}
              </div>
              <div className="mt-2 text-[12px] text-lol-text">Build from your last game</div>
            </>
          ) : (
            <div className="text-[13px] text-lol-text">No build data yet.</div>
          )}
        </HubCard>

        <HubCard
          title="Trends & progress"
          to="/trends"
          linkLabel="Open trends"
          className="md:col-span-2 lg:col-span-1 lg:row-span-2"
        >
          <div className="text-[12px] text-lol-text">Recent form, newest on the right</div>
          <div className="mt-3 flex h-24 items-end gap-0.5" aria-hidden="true">
            {recentForm.map((game, i) => (
              <i
                key={i}
                className={`block flex-1 rounded-sm ${game.win ? "bg-lol-win" : "bg-lol-loss"}`}
                style={{ height: `${game.win ? 100 : 45}%` }}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-[12px] text-lol-text">
            <span>Last {recentForm.length} games</span>
            {summary && summary.recentStreak !== 0 && (
              <span
                className={`font-display font-bold ${summary.recentStreak > 0 ? "text-lol-win" : "text-lol-loss"}`}
              >
                {summary.recentStreak > 0 ? "W" : "L"}
                {Math.abs(summary.recentStreak)} streak
              </span>
            )}
          </div>
          <div className="mt-auto grid grid-cols-2 gap-3 border-t border-lol-border/50 pt-4">
            <BigStatMini label="Win rate" value={games > 0 ? `${winRate.toFixed(1)}%` : "—"} />
            <BigStatMini label="Avg damage" value={avgDamage} />
          </div>
        </HubCard>

        <HubCard title="Stats" to="/data" linkLabel="Open stats">
          <StatRow
            label="Most kills"
            value={records?.mostKills ? String(records.mostKills.value) : "—"}
            championId={records?.mostKills?.championId}
          />
          <StatRow
            label="Highest damage"
            value={records?.mostDamage ? formatNumber(records.mostDamage.value) : "—"}
            championId={records?.mostDamage?.championId}
          />
          <StatRow
            label="Most assists"
            value={records?.mostAssists ? String(records.mostAssists.value) : "—"}
            championId={records?.mostAssists?.championId}
          />
        </HubCard>

        <HubCard title="Records — your peaks" to="/records" linkLabel="Open records">
          <StatRow
            label="Biggest crit"
            value={records?.biggestCrit ? formatNumber(records.biggestCrit.value) : "—"}
            championId={records?.biggestCrit?.championId}
          />
          <StatRow
            label="Most CS"
            value={records?.mostCs ? formatNumber(records.mostCs.value) : "—"}
            championId={records?.mostCs?.championId}
          />
          <StatRow
            label="Most deaths"
            value={records?.mostDeaths ? String(records.mostDeaths.value) : "—"}
            championId={records?.mostDeaths?.championId}
          />
        </HubCard>

        <HubCard title="Best milestone" to="/records" linkLabel="Open records">
          {nextMilestone ? (
            <>
              <div className="font-display text-[16px] font-bold text-lol-text-bright">
                {formatNumber(nextMilestone)} tracked games
              </div>
              <div className="text-[12px] text-lol-text">
                {formatNumber(nextMilestone - allTimeGames)} to go in {modeName}
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <i
                  className="block h-full rounded-full bg-lol-gold"
                  style={{ width: `${milestonePct}%` }}
                />
              </div>
              <div className="mt-2 text-[12px] text-lol-text">
                {formatNumber(allTimeGames)} / {formatNumber(nextMilestone)}
              </div>
            </>
          ) : (
            <div className="text-[13px] text-lol-text">Every milestone reached.</div>
          )}
        </HubCard>
      </div>

      {/* 5. Navigation & insights hub */}
      <section>
        <div className="font-display text-[10px] font-bold uppercase tracking-widest text-lol-gold">
          Keep exploring
        </div>
        <h2 className="mb-3 mt-1 font-display text-[22px] font-bold text-lol-text-bright">
          Navigation & Insights Hub
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {HUB.map(({ to, title, text, Icon }) => (
            <Link
              key={to}
              to={to}
              className="group relative rounded-[14px] border border-lol-border bg-[var(--theme-card)] p-4 transition-colors hover:border-lol-crimson/50"
            >
              <ChevronRightIcon className="absolute right-3 top-3 h-4 w-4 -rotate-45 text-lol-text group-hover:text-lol-text-bright" />
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lol-crimson/15 text-lol-crimson">
                <Icon className="h-5 w-5" />
              </span>
              <div className="mt-3 font-display text-[14px] font-semibold text-lol-text-bright">
                {title}
              </div>
              <div className="text-[12px] text-lol-text">{text}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* 6. Bottom row: friends, augments and runes, live data */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <HubCard title="Friends & foes" to="/friends" linkLabel="Open friends">
          {friends.length > 0 ? (
            <div className="flex flex-col gap-2">
              {friends.map((friend) => (
                <Link
                  key={friend.key}
                  to={`/friends/${encodeURIComponent(friend.key)}`}
                  className="flex items-center gap-2.5 rounded-md px-1 py-0.5 transition-colors hover:bg-white/[0.04]"
                >
                  <SummonerIcon iconId={friend.profileIcon} size={28} className="rounded-lg" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-lol-text-bright">
                    {friend.name}
                  </span>
                  <span className="text-[12px] text-lol-text">
                    {friend.games}g · {Math.round((friend.wins / Math.max(1, friend.games)) * 100)}%
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-[13px] text-lol-text">No frequent teammates yet.</div>
          )}
        </HubCard>

        <HubCard
          title={isMayhem ? "Augments" : "Augments & runes"}
          to="/augments"
          linkLabel="Open augments"
        >
          {lastMatchAugments.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2">
                {lastMatchAugments.map((augmentId) => (
                  <AugmentIcon
                    key={augmentId}
                    augmentId={augmentId}
                    size={32}
                    patch={lastMatch?.game_version}
                  />
                ))}
              </div>
              <div className="mt-2 text-[12px] text-lol-text">Augments from your last game</div>
            </>
          ) : (
            <div className="text-[13px] text-lol-text">No augments in your last game.</div>
          )}
          {!isMayhem && (
            <Link to="/runes" className="mt-auto pt-3 text-[12px] font-semibold text-lol-text">
              Rune statistics →
            </Link>
          )}
        </HubCard>

        <HubCard title="Live data & patch" to="/data" linkLabel="Open data">
          <div className="flex items-center gap-2 text-[13px] text-lol-text-bright">
            <span
              className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-lol-win" : "bg-lol-text/40"}`}
            />
            {liveGame
              ? `In match: ${LIVE_MODE_LABEL[liveGame.gameMode] ?? liveGame.gameMode} - ${liveGame.activePlayer.championName}`
              : connected
                ? "League client connected"
                : "Connect League to sync new games"}
          </div>
          <div className="mt-3 text-[12px] text-lol-text">
            {patchOf(lastMatch?.game_version)
              ? `Latest tracked patch: ${patchOf(lastMatch?.game_version)}`
              : "No patch data yet."}
          </div>
        </HubCard>
      </div>
    </div>
  );
}

function BigStatMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className={LABEL}>{label}</div>
      <div className="font-display text-[20px] font-bold text-lol-text-bright">{value}</div>
    </div>
  );
}
