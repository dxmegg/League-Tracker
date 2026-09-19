import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useIpc } from "../hooks/useIpc";
import { useHistoryScopeQueue } from "../lib/historyScope";
import { useChampionData, getChampionName } from "../hooks/useChampions";
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
}: {
  label: string;
  icon: ReactNode;
  accent: StatAccent;
  value: ReactNode;
  sub?: ReactNode;
  match: RecordMatchRef;
  champData: ChampionData;
  onOpen: (match: RecordMatchRef) => void;
}) {
  return (
    <button
      onClick={() => onOpen(match)}
      title="View match"
      className="group flex flex-col items-center text-center gap-3 rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] p-5 transition-colors hover:border-lol-gold/50 hover:shadow-[0_0_3px_rgba(201,162,77,0.45),0_0_10px_rgba(165,15,21,0.35),0_0_20px_rgba(60,10,10,0.20)] cursor-pointer"
    >
      <div className="relative flex items-center justify-center gap-2 mb-0">
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] p-6"
        onClick={(e) => e.stopPropagation()}
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
    value: (r) => (
      <span className={scoreColor(r.value)}>
        {r.value.toFixed(1)}
        <span className="text-lg font-semibold text-lol-text/60"> / 10</span>
      </span>
    ),
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
  const queueParam = searchParams.get("queue");
  const queue = queueParam ? Number(queueParam) : undefined;
  const account = searchParams.get("account") || undefined;
  const setQueue = (q: number | undefined) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (q == null) next.delete("queue");
        else next.set("queue", String(q));
        return next;
      },
      { replace: true },
    );
  };
  const setAccount = (puuid: string | undefined) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (puuid == null) next.delete("account");
        else next.set("account", puuid);
        return next;
      },
      { replace: true },
    );
  };

  const scopedQueue = queue ?? useHistoryScopeQueue();
  const { data, refetch } = useIpc<RecordsData>(
    () => window.api.getRecords(scopedQueue, account),
    [scopedQueue, account],
  );
  const champData = useChampionData();
  const [puuids, setPuuids] = useState<string[] | null>(null);
  const [openMatch, setOpenMatch] = useState<RecordMatchRef | null>(null);
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);

  useEffect(() => {
    window.api.getAllSummonerPuuids().then(setPuuids);
  }, []);

  useEffect(() => {
    window.api
      .listAccountsWithData()
      .then(setAccounts)
      .catch((error: unknown) => {
        console.warn("Could not load accounts for records:", error);
      });
  }, []);

  useEffect(() => {
    const unsub = window.api.onGamesUpdated(() => refetch());
    return unsub;
  }, [refetch]);

  const accountSelect = (
    <FilterSelect
      value={account}
      onChange={(value) => setAccount(value)}
      placeholder="All Accounts"
      title="Account"
      options={accounts.map((item) => ({
        value: item.puuid,
        label: `${item.gameName ?? "Unknown account"}${item.tagLine ? `#${item.tagLine}` : ""}`,
      }))}
    />
  );

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-lol-text">Personal bests</span>
            {accountSelect}
          </div>
        </div>
        <div className="rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] p-12 text-center">
          <p className="text-sm text-lol-text">Loading records…</p>
        </div>
      </div>
    );
  }

  if (data.totalGames === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-lol-text">Personal bests</span>
            {accountSelect}
          </div>
        </div>
        <div className="rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] p-12 text-center">
          <p className="text-sm font-semibold text-lol-text-bright">No records yet</p>
          <p className="text-xs text-lol-text mt-1">Play more matches to set personal bests.</p>
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <span className="text-xs text-lol-text">
            personal bests across {data.totalGames} {data.totalGames === 1 ? "game" : "games"}
          </span>
          {accountSelect}
          <div className="[&_select]:h-9 [&_select]:rounded-md [&_select]:border [&_select]:border-lol-border/60 [&_select]:bg-lol-card/40 [&_select]:px-3 [&_select]:text-xs [&_select]:text-lol-text-bright [&_select]:focus-visible:outline-none [&_select]:focus-visible:border-lol-gold/60 [&_select]:focus-visible:ring-1 [&_select]:focus-visible:ring-lol-gold/40 [&_select]:transition-colors">
            <QueueSelect value={queue} onChange={setQueue} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 items-stretch">
        {cards.map(({ key, ...card }) => (
          <RecordCard key={key} {...card} champData={champData} onOpen={setOpenMatch} />
        ))}
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
