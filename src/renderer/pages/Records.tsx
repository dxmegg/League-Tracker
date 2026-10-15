import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useIpc } from "../hooks/useIpc";
import { useHistoryScopeQueue } from "../lib/historyScope";
import {
  getAccountsWithData,
  getChampionName,
  invalidateAccountsCache,
  useChampionData,
} from "../hooks/useChampions";
import type {
  ChampionData,
  MatchDetail,
  RecordMatchRef,
  RecordsData,
  StatRecord,
  StreakRecord,
} from "../lib/types";
import ChampionIcon from "../components/ChampionIcon";
import MatchScoreboard from "../components/MatchScoreboard";
import QueueSelect, { queueLabel } from "../components/QueueSelect";
import { FilterSelect } from "../components/FilterSelect";
import { Panel } from "../components/Panel";
import { SectionHeading } from "../components/SectionHeading";
import { type StatAccent } from "../components/StatCard";
import {
  CoinsIcon,
  CrosshairIcon,
  FlameIcon,
  HeartIcon,
  HourglassIcon,
  ShieldIcon,
  SkullIcon,
  StarIcon,
  SwordsIcon,
  TimerIcon,
  TrophyIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  UsersIcon,
  XIcon,
  ZapIcon,
} from "../components/icons";
import { formatDuration, formatKDA, kdaRatio } from "../lib/format";
import { scoreColor } from "../../shared/opScore";
import type { AccountListItem } from "../lib/types";
import { useActiveTheme } from "../hooks/useActiveTheme";
import { RecordsExp } from "../components/RecordsExp";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";

// Records are moments, not recency — "3 months ago" undersells a trophy, so
// they get a real date.
function recordDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---- Record cards ----

// The same tile treatment as StatCard, but a button: every record opens the
// game it was set in.
function RecordCard({
  label,
  value,
  sub,
  match,
  champData,
  onOpen,
  tileIndex,
}: {
  label: string;
  icon: ReactNode;
  accent: StatAccent;
  value: ReactNode;
  sub?: ReactNode;
  match: RecordMatchRef;
  champData: ChampionData;
  onOpen: (match: RecordMatchRef) => void;
  tileIndex: number;
}) {
  const tileTreatment =
    tileIndex % 3 === 0
      ? {
          border: "border-t-lol-gold",
          glow: "bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-gold)_8%,transparent),transparent_42%),linear-gradient(145deg,var(--theme-card)_0%,var(--theme-card-hover)_48%,var(--theme-card)_100%)]",
          dot: "bg-lol-gold shadow-[0_0_7px_rgba(201,164,92,0.55)]",
        }
      : tileIndex % 3 === 1
        ? {
            border: "border-t-lol-win",
            glow: "bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-win)_8%,transparent),transparent_42%),linear-gradient(145deg,var(--theme-card)_0%,var(--theme-card-hover)_48%,var(--theme-card)_100%)]",
            dot: "bg-lol-win shadow-[0_0_7px_rgba(74,222,128,0.45)]",
          }
        : {
            border: "border-t-lol-crimson",
            glow: "bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_8%,transparent),transparent_42%),linear-gradient(145deg,var(--theme-card)_0%,var(--theme-card-hover)_48%,var(--theme-card)_100%)]",
            dot: "bg-lol-crimson shadow-[0_0_7px_rgba(165,15,21,0.55)]",
          };

  return (
    <button
      onClick={() => onOpen(match)}
      title="View match"
      className={`group flex flex-col items-center gap-3 rounded-lg border border-lol-crimson/40 border-t-[3px] ${tileTreatment.border} ${tileTreatment.glow} p-5 text-center shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] transition-colors duration-[120ms] hover:bg-white/[0.02] hover:border-lol-gold/50 hover:shadow-[0_0_3px_rgba(201,162,77,0.45),0_0_10px_rgba(165,15,21,0.35),0_0_20px_rgba(60,10,10,0.20)] cursor-pointer`}
    >
      <div className="relative flex items-center justify-center gap-2 mb-0">
        <span className={`h-1.5 w-1.5 rounded-full ${tileTreatment.dot}`} />
        <span className="text-xs font-bold uppercase tracking-wider text-lol-text">{label}</span>
      </div>
      <div className="relative text-4xl font-bold text-lol-text-bright leading-none">{value}</div>
      {sub && <div className="relative text-sm text-lol-text">{sub}</div>}
      <div className="relative mt-auto flex flex-col items-center gap-2">
        <div className="rounded-full p-[2px] ring-2 ring-lol-border/40 transition-colors group-hover:ring-lol-gold/50">
          <div className="overflow-hidden rounded-full">
            <ChampionIcon championId={match.champion_id} size={48} />
          </div>
        </div>
        <div className="min-w-0 max-w-full">
          <div className="text-base font-bold text-lol-text-bright truncate">
            {getChampionName(champData, match.champion_id)}
          </div>
          <div className="text-sm text-lol-text truncate">
            <span className={match.win ? "text-lol-win" : "text-lol-loss"}>
              {match.win ? "W" : "L"}
            </span>
            {" · "}
            {formatKDA(match.kills, match.deaths, match.assists)}
            {" · "}
            {recordDate(match.game_creation)}
          </div>
        </div>
      </div>
    </button>
  );
}

// ---- Match modal ----

// Records live outside the match list, so their games open here rather than
// deep-linking into an infinitely-scrolled page.
function MatchModal({
  match,
  champData,
  puuids,
  onClose,
}: {
  match: RecordMatchRef;
  champData: ChampionData;
  puuids: string[] | null;
  onClose: () => void;
}) {
  const { data: detail } = useIpc<MatchDetail>(
    () => window.api.getMatchDetail(match.game_id),
    [match.game_id],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close match detail"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,var(--theme-card)_0%,var(--theme-card-hover)_48%,var(--theme-card)_100%)] p-6 shadow-[0_0_3px_color-mix(in_oklab,var(--theme-crimson)_55%,transparent),0_0_10px_color-mix(in_oklab,var(--theme-crimson)_35%,transparent),0_0_20px_color-mix(in_oklab,var(--theme-crimson)_20%,transparent)] ring-1 ring-inset ring-white/[0.03]"
      >
        <div className="flex items-center gap-3 mb-3 pr-12">
          <ChampionIcon championId={match.champion_id} size={36} />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold uppercase tracking-wider text-lol-gold mb-3 truncate">
              <span className={match.win ? "text-lol-win" : "text-lol-loss"}>
                {match.win ? "Victory" : "Defeat"}
              </span>
              {" — "}
              {getChampionName(champData, match.champion_id)}{" "}
              {formatKDA(match.kills, match.deaths, match.assists)}
            </div>
            <div className="text-xs text-lol-text truncate">
              {queueLabel(match.queue_id)} · {formatDuration(match.game_duration)} ·{" "}
              {recordDate(match.game_creation)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close match detail"
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md border border-lol-border/60 bg-lol-card/40 text-lol-text transition-colors hover:border-lol-crimson/60 hover:bg-lol-crimson/15 hover:text-lol-crimson-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)]"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-x-auto">
          {detail ? (
            <MatchScoreboard detail={detail} champData={champData} puuids={puuids} />
          ) : (
            <div className="text-sm text-lol-text text-center py-8">Loading...</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Page ----

interface CardDef {
  key: string;
  label: string;
  icon: ReactNode;
  accent: StatAccent;
  value: ReactNode;
  sub?: ReactNode;
  match: RecordMatchRef;
}

function statCards(bests: RecordsData["bests"]): CardDef[] {
  const cards: CardDef[] = [];
  const add = (
    record: StatRecord | null,
    def: Omit<CardDef, "match" | "value"> & { value: (r: StatRecord) => ReactNode },
  ) => {
    if (record) cards.push({ ...def, value: def.value(record), match: record.match });
  };
  const n = (v: number) => Math.round(v).toLocaleString();

  add(bests.kills, {
    key: "kills",
    label: "Most Kills",
    icon: <SwordsIcon className="w-3 h-3" />,
    accent: "gold",
    value: (r) => r.value,
  });
  add(bests.kda, {
    key: "kda",
    label: "Best KDA",
    icon: <ZapIcon className="w-3 h-3" />,
    accent: "sky",
    // kdaRatio turns a deathless game into "Perfect" — better than the raw
    // rank value, which pretends one death happened
    value: (r) => kdaRatio(r.match.kills, r.match.deaths, r.match.assists),
  });
  add(bests.score, {
    key: "score",
    label: "Highest Score",
    icon: <StarIcon className="w-3 h-3" />,
    accent: "gold",
    value: (r) => {
      const displayScore = Math.min(r.value, 10);
      return (
        <span className={scoreColor(r.value)}>
          {displayScore.toFixed(1)}
          <span className="text-lg font-semibold text-lol-text/60"> / 10</span>
        </span>
      );
    },
  });
  add(bests.killingSpree, {
    key: "spree",
    label: "Longest Killing Spree",
    icon: <FlameIcon className="w-3 h-3" />,
    accent: "purple",
    value: (r) => r.value,
    sub: "kills without dying",
  });
  add(bests.damage, {
    key: "damage",
    label: "Most Damage Dealt",
    icon: <SwordsIcon className="w-3 h-3" />,
    accent: "sky",
    value: (r) => n(r.value),
  });
  add(bests.damageTaken, {
    key: "taken",
    label: "Most Damage Taken",
    icon: <ShieldIcon className="w-3 h-3" />,
    accent: "win",
    value: (r) => n(r.value),
  });
  add(bests.totalDamage, {
    key: "totalDamage",
    label: "Most Total Damage Dealt",
    icon: <CrosshairIcon className="w-3 h-3" />,
    accent: "purple",
    value: (r) => n(r.value),
    sub: "champions, minions & objectives",
  });
  add(bests.trueDamage, {
    key: "trueDamage",
    label: "Most True Damage Dealt",
    icon: <ZapIcon className="w-3 h-3" />,
    accent: "gold",
    value: (r) => n(r.value),
  });
  add(bests.cs, {
    key: "cs",
    label: "Most CS in Game",
    icon: <TrophyIcon className="w-3 h-3" />,
    accent: "sky",
    value: (r) => n(r.value),
  });
  add(bests.csPerMinute, {
    key: "csPerMinute",
    label: "Highest CS per Minute",
    icon: <TrendingUpIcon className="w-3 h-3" />,
    accent: "sky",
    value: (r) => r.value.toFixed(2),
  });
  add(bests.healing, {
    key: "healing",
    label: "Most Healing",
    icon: <HeartIcon className="w-3 h-3" />,
    accent: "win",
    value: (r) => n(r.value),
  });
  add(bests.gold, {
    key: "gold",
    label: "Most Gold Earned",
    icon: <CoinsIcon className="w-3 h-3" />,
    accent: "gold",
    value: (r) => n(r.value),
  });
  add(bests.assists, {
    key: "assists",
    label: "Most Assists",
    icon: <UsersIcon className="w-3 h-3" />,
    accent: "sky",
    value: (r) => r.value,
  });
  add(bests.deaths, {
    key: "deaths",
    label: "Most Deaths",
    icon: <SkullIcon className="w-3 h-3" />,
    accent: "purple",
    value: (r) => r.value,
    sub: "we don't talk about this one",
  });
  add(bests.fastestWin, {
    key: "fastestWin",
    label: "Fastest Win",
    icon: <TimerIcon className="w-3 h-3" />,
    accent: "win",
    value: (r) => formatDuration(r.value),
  });
  add(bests.fastestLoss, {
    key: "fastestLoss",
    label: "Fastest Loss",
    icon: <TimerIcon className="w-3 h-3" />,
    accent: "purple",
    value: (r) => formatDuration(r.value),
  });
  add(bests.longestGame, {
    key: "longestGame",
    label: "Longest Game",
    icon: <HourglassIcon className="w-3 h-3" />,
    accent: "purple",
    value: (r) => formatDuration(r.value),
  });
  add(bests.criticalStrike, {
    key: "criticalStrike",
    label: "Highest Critical Strike",
    icon: <FlameIcon className="w-3 h-3" />,
    accent: "gold",
    value: (r) => n(r.value),
  });
  return cards;
}

function streakCard(streak: StreakRecord, win: boolean): CardDef {
  const range =
    recordDate(streak.start) === recordDate(streak.end)
      ? recordDate(streak.start)
      : `${recordDate(streak.start)} – ${recordDate(streak.end)}`;
  return {
    key: win ? "winStreak" : "lossStreak",
    label: win ? "Longest Win Streak" : "Longest Loss Streak",
    icon: win ? <TrendingUpIcon className="w-3 h-3" /> : <TrendingDownIcon className="w-3 h-3" />,
    accent: win ? "win" : "purple",
    value: `${streak.length} ${win ? "wins" : "losses"}`,
    sub: range,
    match: streak.match,
  };
}

export default function Records() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTheme = useActiveTheme();
  const isExperiment = activeTheme === "experiment";
  const queueParam = searchParams.get("queue");
  const q = queueParam == null ? undefined : Number(queueParam);
  const queue = q !== undefined && Number.isFinite(q) ? q : undefined;
  const accountParam = searchParams.get("account") || undefined;
  const urlAccount = accountParam || "all";
  const setQueue = useCallback(
    (q: number | undefined) => {
      setSearchParams(
        (prev) => {
          const current = prev.get("queue");
          const nextValue = q == null ? null : String(q);
          if (current === nextValue) return prev;
          const next = new URLSearchParams(prev);
          if (q == null) next.delete("queue");
          else next.set("queue", String(q));
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const setAccount = useCallback(
    (puuid: string | undefined) => {
      setSearchParams(
        (prev) => {
          const current = prev.get("account") ?? ALL_ACCOUNTS_SENTINEL;
          const nextValue = puuid ?? ALL_ACCOUNTS_SENTINEL;
          if (current === nextValue) return prev;
          const next = new URLSearchParams(prev);
          if (nextValue === ALL_ACCOUNTS_SENTINEL) next.delete("account");
          else next.set("account", nextValue);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const historyScopeQueue = useHistoryScopeQueue();
  const scopedQueue = queue ?? historyScopeQueue;
  const accountForFetch = urlAccount;
  const { data, error, refetch } = useIpc<RecordsData>(
    () => window.api.getRecords(scopedQueue, accountForFetch),
    [scopedQueue, accountForFetch],
  );
  const champData = useChampionData();
  const [puuids, setPuuids] = useState<string[] | null>(null);
  const [openMatch, setOpenMatch] = useState<RecordMatchRef | null>(null);
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);

  useEffect(() => {
    window.api.getAllSummonerPuuids().then(setPuuids);
  }, []);

  useEffect(() => {
    getAccountsWithData()
      .then(setAccounts)
      .catch((error: unknown) => {
        console.warn("Could not load accounts for records:", error);
      });
  }, []);

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => {
      invalidateAccountsCache();
      void refetch();
    });
    return unsub;
  }, [refetch]);

  if (isExperiment) {
    const activeAccount = accounts.find((item) => item.puuid === accountForFetch);
    const accountName = activeAccount
      ? `${activeAccount.gameName ?? "Unknown account"}${activeAccount.tagLine ? `#${activeAccount.tagLine}` : ""}`
      : undefined;
    const accountValue = accountForFetch === "all" ? undefined : accountForFetch;
    return (
      <RecordsExp
        data={data}
        error={error}
        onRetry={refetch}
        accountName={accountName}
        queue={queue}
        onQueueChange={setQueue}
        account={accountValue}
        accounts={accounts}
        onAccountChange={setAccount}
      />
    );
  }

  const accountSelect = (
    <FilterSelect
      value={accountParam}
      onChange={setAccount}
      placeholder="All Accounts"
      title="Account"
      options={accounts.map((item) => ({
        value: item.puuid,
        label: `${item.gameName ?? "Unknown account"}${item.tagLine ? `#${item.tagLine}` : ""}`,
      }))}
      variant="segmented"
    />
  );

  const activeAccount = accounts.find((item) => item.puuid === accountForFetch);
  const activeAccountName = activeAccount
    ? `${activeAccount.gameName ?? "Unknown account"}${activeAccount.tagLine ? `#${activeAccount.tagLine}` : ""}`
    : "All accounts";
  const header = (
    <div className="shrink-0 rounded-xl border border-lol-border border-t-[3px] border-t-lol-crimson bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_10%,transparent),transparent_46%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="relative pl-4 font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2.5 before:w-2.5 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
            Records
          </h1>
          <p className="relative mt-1.5 pl-4 text-lol-text">
            {activeAccountName === "All accounts"
              ? "Personal bests across all accounts"
              : `Personal bests for ${activeAccountName}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <QueueSelect value={queue} onChange={setQueue} variant="segmented" />
          {accountSelect}
        </div>
      </div>
    </div>
  );

  if (error) {
    const errorMessage = error;
    return (
      <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
        {header}
        <div className="rounded-xl border border-lol-border bg-lol-card p-12 text-center">
          <p className="text-sm font-semibold text-lol-text-bright">Failed to load records.</p>
          {errorMessage && <p className="mt-1 text-xs text-lol-text">{errorMessage}</p>}
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 rounded-md border border-lol-border px-3 py-1.5 text-xs font-semibold text-lol-text transition-colors hover:border-lol-gold/60 hover:text-lol-text-bright"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
        {header}
        <div className="rounded-xl border border-lol-border bg-lol-card p-12 text-center">
          <p className="text-sm text-lol-text">Loading records…</p>
        </div>
      </div>
    );
  }

  if (data.totalGames === 0) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
        {header}
        <div className="relative overflow-hidden rounded-xl border border-lol-border border-t-[3px] border-t-lol-crimson bg-[linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-12 text-center">
          <p className="text-sm font-semibold text-lol-text-bright">No records yet</p>
          <p className="mt-1 text-xs text-lol-text">Play more matches to set personal bests.</p>
        </div>
      </div>
    );
  }

  const cards = statCards(data.bests);
  if (data.winStreak) cards.push(streakCard(data.winStreak, true));
  if (data.lossStreak && data.lossStreak.length > 1) {
    // A single loss is just a loss; it only becomes a "streak" worth
    // memorializing at two.
    cards.push(streakCard(data.lossStreak, false));
  }
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      {header}
      <div>
        <SectionHeading title="Personal bests" />
        <Panel>
          <div className="grid grid-cols-2 items-stretch gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {cards.map(({ key, ...card }, tileIndex) => (
              <RecordCard
                key={key}
                {...card}
                tileIndex={tileIndex}
                champData={champData}
                onOpen={setOpenMatch}
              />
            ))}
          </div>
        </Panel>
      </div>

      {openMatch && (
        <MatchModal
          match={openMatch}
          champData={champData}
          puuids={puuids}
          onClose={() => setOpenMatch(null)}
        />
      )}
    </div>
  );
}
