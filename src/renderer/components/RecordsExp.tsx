import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type {
  AccountListItem,
  RecordMatchRef,
  RecordsData,
  StatRecord,
  StreakRecord,
} from "../lib/types";
import { getChampionName, useChampionData } from "../hooks/useChampions";
import { CHAMPION_SPLASH_URL } from "../lib/constants";
import { formatDuration, formatKDA, formatNumber } from "../lib/format";
import ChampionIcon from "./ChampionIcon";
import { FilterSelect } from "./FilterSelect";
import QueueSelect, { queueLabel } from "./QueueSelect";
import { HeroTile, PageHero } from "./SplashHero";
import { Title } from "./live/shared";

const ROW = "rounded-xl border border-lol-border/40 bg-black/25";
const DURATION_KEYS = new Set(["fastestWin", "fastestLoss", "longestGame", "fastestPentakill"]);

function recordDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatValue(key: string, value: number): string {
  if (DURATION_KEYS.has(key)) return formatDuration(value);
  if (key === "score" || key === "flawlessAce") return Math.min(value, 10).toFixed(1);
  if (key === "kda" || key === "csPerMinute" || key === "damagePerGold") return value.toFixed(2);
  if (key === "ccTime") return formatDuration(Math.round(value));
  if (key === "winStreak" || key === "lossStreak") return `${value} games`;
  return formatNumber(Math.round(value));
}

type Entry = {
  key: string;
  label: string;
  hint: string;
  value: string;
  match: RecordMatchRef;
  // Streaks span several games, so they show a range instead of one date
  when?: string;
};

type Group = { id: string; title: string; note: string; color: string; entries: Entry[] };

function buildGroups(data: RecordsData): Group[] {
  const { bests } = data;
  // A record of zero ("most wards placed: 0") is not a record
  const stat = (
    key: string,
    label: string,
    hint: string,
    record: StatRecord | null | undefined,
  ): Entry | null =>
    record && record.value != null && record.value > 0
      ? { key, label, hint, value: formatValue(key, record.value), match: record.match }
      : null;
  const streak = (
    key: string,
    label: string,
    hint: string,
    record: StreakRecord | null,
  ): Entry | null =>
    record && record.length > 1
      ? {
          key,
          label,
          hint,
          value: formatValue(key, record.length),
          match: record.match,
          when: `${recordDate(record.start)} – ${recordDate(record.end)}`,
        }
      : null;
  const kda = stat("kda", "Best KDA", "kills and assists per death", bests.kda);
  if (kda && bests.kda?.perfect) kda.value = "Perfect";

  const groups: Array<Omit<Group, "entries"> & { entries: Array<Entry | null> }> = [
    {
      id: "combat",
      title: "Combat",
      note: "Fighting in a single game",
      color: "#ff6b57",
      entries: [
        stat("kills", "Most kills", "in one game", bests.kills),
        stat("assists", "Most assists", "in one game", bests.assists),
        kda,
        stat("killingSpree", "Longest killing spree", "kills without dying", bests.killingSpree),
        stat("score", "Highest score", "out of 10", bests.score),
        stat("deaths", "Most deaths", "we don't talk about it", bests.deaths),
      ],
    },
    {
      id: "damage",
      title: "Damage & durability",
      note: "Dealt, soaked and healed",
      color: "#b07cff",
      entries: [
        stat("damage", "Most damage", "to champions", bests.damage),
        stat("totalDamage", "Most total damage", "everything you hit", bests.totalDamage),
        stat("trueDamage", "Most true damage", "ignores resistances", bests.trueDamage),
        stat("criticalStrike", "Biggest crit", "single hit", bests.criticalStrike),
        stat("damageTaken", "Most damage taken", "front line work", bests.damageTaken),
        stat("healing", "Most healing", "in one game", bests.healing),
      ],
    },
    {
      id: "economy",
      title: "Economy & farming",
      note: "Gold and creeps",
      color: "#e0b65c",
      entries: [
        stat("gold", "Most gold", "earned in one game", bests.gold),
        stat("cs", "Most CS", "creeps killed", bests.cs),
        stat("csPerMinute", "Best CS/min", "farming pace", bests.csPerMinute),
        stat("goldPerMinute", "Best gold/min", "income pace", data.goldPerMinute),
        stat("damagePerGold", "Best damage per gold", "to champions", data.damagePerGold),
      ],
    },
    {
      id: "objectives",
      title: "Vision & objectives",
      note: "Map play",
      color: "#4db8ff",
      entries: [
        stat("turretDamage", "Most turret damage", "to towers", data.turretDamage),
        stat("objectiveDamage", "Most objective damage", "all objectives", data.objectiveDamage),
        stat("visionScore", "Highest vision score", "in one game", data.visionScore),
        stat("turretKills", "Most turrets destroyed", "in one game", data.turretKills),
        stat("ccTime", "Most crowd control", "time spent on others", data.ccTime),
        stat("wardsPlaced", "Most wards placed", "in one game", data.wardsPlaced),
      ],
    },
    {
      id: "time",
      title: "Streaks & game length",
      note: "Runs, marathons and stomps",
      color: "#3ddc97",
      entries: [
        streak("winStreak", "Longest win streak", "wins in a row", data.winStreak),
        streak("lossStreak", "Longest loss streak", "losses in a row", data.lossStreak),
        stat("fastestWin", "Fastest win", "shortest victory", bests.fastestWin),
        stat("fastestLoss", "Fastest loss", "shortest defeat", bests.fastestLoss),
        stat("longestGame", "Longest game", "either result", bests.longestGame),
        stat("fastestPentakill", "Fastest pentakill", "game time", data.fastestPentakill),
        stat("flawlessAce", "Deathless defeat", "best score without dying", data.flawlessAce),
      ],
    },
  ];
  return groups
    .map((group) => ({ ...group, entries: group.entries.filter((e): e is Entry => e !== null) }))
    .filter((group) => group.entries.length > 0);
}

function RecordCard({ entry, color }: { entry: Entry; color: string }) {
  const champions = useChampionData();
  const { match } = entry;
  const splash = champions[match.champion_id]?.key;
  return (
    <Link
      to={`/match/${match.game_id}`}
      title="Open the match"
      className="group relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border border-lol-border/60 bg-black/30 p-4 transition-colors hover:border-lol-border-hover"
      style={{ boxShadow: `inset 0 3px 0 ${color}` }}
    >
      {splash && (
        <img
          src={CHAMPION_SPLASH_URL(splash)}
          alt=""
          loading="lazy"
          className="pointer-events-none absolute inset-y-0 right-0 h-full w-3/5 object-cover object-[50%_20%] opacity-25 transition-opacity [mask-image:linear-gradient(90deg,transparent,black_70%)] group-hover:opacity-45"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      <div className="relative">
        <div className="font-display text-[11px] font-bold uppercase tracking-widest text-lol-text-bright">
          {entry.label}
        </div>
        <div className="text-[11px] text-lol-text">{entry.hint}</div>
      </div>
      <div
        className="relative font-display text-[36px] font-bold leading-none tabular-nums"
        style={{ color }}
      >
        {entry.value}
      </div>
      <div className="relative flex items-center gap-2.5">
        <ChampionIcon championId={match.champion_id} size={36} className="rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-lol-text-bright">
            {getChampionName(champions, match.champion_id)}
            <span className="ml-2 font-normal tabular-nums text-lol-text">
              {formatKDA(match.kills, match.deaths, match.assists)}
            </span>
          </div>
          <div className="truncate text-[11px] text-lol-text">
            {entry.when ?? `${recordDate(match.game_creation)} · ${queueLabel(match.queue_id)}`}
          </div>
        </div>
        {!entry.when && (
          <span
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
              match.win ? "bg-lol-win/15 text-lol-win" : "bg-lol-loss/15 text-lol-loss"
            }`}
          >
            {match.win ? "WIN" : "LOSS"}
          </span>
        )}
      </div>
    </Link>
  );
}

function aside(text: string) {
  return <span className="text-[12px] text-lol-text">{text}</span>;
}

// Which champions own the most records
function RecordHolders({ groups }: { groups: Group[] }) {
  const champions = useChampionData();
  const held = new Map<number, string[]>();
  for (const entry of groups.flatMap((g) => g.entries)) {
    held.set(entry.match.champion_id, [...(held.get(entry.match.champion_id) ?? []), entry.label]);
  }
  const top = [...held.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5);
  return (
    <section className="app-tile min-w-0">
      <Title aside={aside("champions with the most records")}>Record holders</Title>
      <div className="flex flex-col gap-1.5">
        {top.map(([id, labels], index) => (
          <Link
            key={id}
            to={`/champions/${id}`}
            className={`flex items-center gap-3 px-3 py-2 transition-colors hover:bg-white/[0.04] ${ROW}`}
          >
            <span className="w-4 font-display text-[13px] font-bold text-lol-text/60">
              {index + 1}
            </span>
            <ChampionIcon championId={id} size={38} className="rounded-lg" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-[14px] font-bold text-lol-text-bright">
                {getChampionName(champions, id)}
              </div>
              <div className="truncate text-[11px] text-lol-text">{labels.join(" · ")}</div>
            </div>
            <span className="font-display text-[20px] font-bold tabular-nums text-lol-gold">
              {labels.length}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ListRow({
  gameId,
  championId,
  title,
  sub,
  value,
}: {
  gameId?: string;
  championId?: number;
  title: string;
  sub: string;
  value?: ReactNode;
}) {
  const body = (
    <>
      {championId !== undefined ? (
        <ChampionIcon championId={championId} size={38} className="rounded-lg" />
      ) : (
        <span className="h-[38px] w-[38px] shrink-0 rounded-lg border border-lol-border/60" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[14px] font-bold text-lol-text-bright">
          {title}
        </div>
        <div className="text-[11px] text-lol-text">{sub}</div>
      </div>
      {value}
    </>
  );
  const className = `flex items-center gap-3 px-3 py-2 ${ROW}`;
  return gameId ? (
    <Link
      to={`/match/${gameId}`}
      className={`${className} transition-colors hover:bg-white/[0.04]`}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

const MULTIKILLS = [
  ["doubles", "Double kills", "#4db8ff"],
  ["triples", "Triple kills", "#e0b65c"],
  ["quadras", "Quadra kills", "#ff9f43"],
  ["pentakills", "Pentakills", "#ff6b57"],
] as const;

function Message({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="app-tile text-center">
      <p className="text-sm font-semibold text-lol-text-bright">{title}</p>
      {children}
    </div>
  );
}

export function RecordsExp({
  data,
  error,
  onRetry,
  accountName,
  queue,
  onQueueChange,
  account,
  accounts,
  onAccountChange,
}: {
  data: RecordsData | null;
  error: string | null;
  onRetry: () => Promise<void>;
  accountName?: string;
  queue: number | undefined;
  onQueueChange: (queue: number | undefined) => void;
  account: string | undefined;
  accounts: AccountListItem[];
  onAccountChange: (account: string | undefined) => void;
}) {
  const champions = useChampionData();
  const ready = !!data && data.totalGames > 0 && !error;
  const groups = ready ? buildGroups(data) : [];
  const count = groups.reduce((n, g) => n + g.entries.length, 0);
  const latest = ready ? data.recentlyBroken?.[0] : undefined;

  return (
    <div className="flex min-h-full w-full flex-col gap-5">
      <PageHero
        title="Records"
        subtitle={
          accountName ? `Personal bests for ${accountName}` : "Personal bests across all accounts"
        }
      >
        <HeroTile
          label="Records held"
          value={ready ? String(count) : "—"}
          sub={ready ? `from ${formatNumber(data.totalGames)} games` : undefined}
        />
        <HeroTile
          label="Pentakills"
          value={ready ? formatNumber(data.multikillTotals?.pentakills ?? 0) : "—"}
          sub="lifetime"
          valueClass="text-lol-loss"
        />
        <HeroTile
          label="Best win streak"
          value={ready && data.winStreak ? String(data.winStreak.length) : "—"}
          sub="games in a row"
          valueClass="text-lol-win"
        />
        <HeroTile
          label="Latest record"
          value={latest ? latest.label : "—"}
          sub={latest ? recordDate(latest.gameCreation) : undefined}
          valueClass="!text-[18px] text-lol-gold"
        />
      </PageHero>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2" aria-label="Record groups">
          {groups.map((group) => (
            <button
              type="button"
              key={group.id}
              onClick={() =>
                document
                  .getElementById(`records-${group.id}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="flex items-center gap-2 rounded-lg border border-lol-border/60 bg-lol-card/40 px-3 py-1.5 text-xs font-semibold text-lol-text transition-colors hover:text-lol-text-bright"
            >
              <i className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
              {group.title}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <QueueSelect value={queue} onChange={onQueueChange} variant="segmented" />
          <FilterSelect
            value={account}
            onChange={onAccountChange}
            placeholder="All Accounts"
            title="Account"
            options={accounts.map((item) => ({
              value: item.puuid,
              label: `${item.gameName ?? "Unknown account"}${item.tagLine ? `#${item.tagLine}` : ""}`,
            }))}
            allowClear
            variant="segmented"
          />
        </div>
      </div>

      {error ? (
        <Message title="Failed to load records.">
          <p className="mt-1 text-xs text-lol-text">{error}</p>
          <button
            type="button"
            onClick={() => void onRetry()}
            className="mt-4 rounded-md border border-lol-border px-3 py-1.5 text-xs font-semibold text-lol-text transition-colors hover:border-lol-gold/60 hover:text-lol-text-bright"
          >
            Retry
          </button>
        </Message>
      ) : !data ? (
        <Message title="Loading records…" />
      ) : data.totalGames === 0 ? (
        <Message title="No records yet">
          <p className="mt-1 text-xs text-lol-text">Play more matches to set personal bests.</p>
        </Message>
      ) : (
        <>
          {groups.map((group) => (
            <section key={group.id} id={`records-${group.id}`} className="app-tile min-w-0">
              <Title aside={aside(`${group.note} · ${group.entries.length} records`)}>
                <span style={{ color: group.color }}>{group.title}</span>
              </Title>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
                {group.entries.map((entry) => (
                  <RecordCard key={entry.key} entry={entry} color={group.color} />
                ))}
              </div>
            </section>
          ))}

          {data.multikillTotals && (
            <section className="app-tile min-w-0">
              <Title aside={aside("lifetime totals")}>Multikills</Title>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {MULTIKILLS.map(([key, label, color]) => (
                  <div key={key} className={`p-4 text-center ${ROW}`}>
                    <div
                      className="font-display text-[38px] font-bold leading-none tabular-nums"
                      style={{ color }}
                    >
                      {formatNumber(data.multikillTotals![key])}
                    </div>
                    <div className="mt-2 text-[11px] font-bold uppercase tracking-widest text-lol-text">
                      {label}
                    </div>
                    <div className="mt-1 text-[11px] text-lol-text/70">
                      {(data.multikillTotals![key] / data.totalGames).toFixed(2)} per game
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <RecordHolders groups={groups} />
            <section className="app-tile min-w-0">
              <Title aside={aside("newest first")}>Recently broken</Title>
              <div className="flex flex-col gap-1.5">
                {(data.recentlyBroken ?? []).map((record) => {
                  const entry = groups.flatMap((g) => g.entries).find((e) => e.key === record.key);
                  return (
                    <ListRow
                      key={record.key}
                      gameId={record.gameId}
                      championId={entry?.match.champion_id}
                      title={entry?.label ?? record.label}
                      sub={recordDate(record.gameCreation)}
                      value={
                        <span className="font-display text-[17px] font-bold tabular-nums text-lol-gold">
                          {entry?.value ?? formatValue(record.key, record.value)}
                        </span>
                      }
                    />
                  );
                })}
              </div>
            </section>
            <section className="app-tile min-w-0">
              <Title aside={aside("career moments")}>Milestones</Title>
              <div className="flex flex-col gap-1.5">
                {(data.milestones ?? []).map((milestone) => (
                  <ListRow
                    key={milestone.key}
                    gameId={milestone.gameId}
                    championId={milestone.championId}
                    title={milestone.label}
                    sub={recordDate(milestone.gameCreation)}
                  />
                ))}
              </div>
            </section>
          </div>

          {data.bestByQueue && data.bestByQueue.length > 0 && (
            <section className="app-tile min-w-0">
              <Title aside={aside("click a value to open the match")}>Best by queue</Title>
              <div className="overflow-x-auto">
                <div className="flex min-w-[820px] flex-col gap-1.5">
                  <div className="grid grid-cols-[minmax(160px,1.2fr)_repeat(3,minmax(170px,1fr))_110px] gap-3 px-3 text-[10px] font-bold uppercase tracking-widest text-lol-text">
                    <span>Queue</span>
                    <span>Most kills</span>
                    <span>Best KDA</span>
                    <span>Most damage</span>
                    <span className="text-right">Win streak</span>
                  </div>
                  {data.bestByQueue.map((row) => (
                    <div
                      key={row.queueLabel}
                      className={`grid grid-cols-[minmax(160px,1.2fr)_repeat(3,minmax(170px,1fr))_110px] items-center gap-3 px-3 py-2 ${ROW}`}
                    >
                      <b className="truncate font-display text-[14px] text-lol-text-bright">
                        {row.queueLabel}
                      </b>
                      {(
                        [
                          ["kills", row.mostKills],
                          ["kda", row.highestKda],
                          ["damage", row.mostDamage],
                        ] as const
                      ).map(([key, record]) => (
                        <Link
                          key={key}
                          to={`/match/${record.match.game_id}`}
                          className="flex items-center gap-2.5 rounded-lg px-1 py-0.5 hover:bg-white/[0.06]"
                          title={getChampionName(champions, record.match.champion_id)}
                        >
                          <ChampionIcon
                            championId={record.match.champion_id}
                            size={30}
                            className="rounded-md"
                          />
                          <span className="font-display text-[15px] font-bold tabular-nums text-lol-text-bright">
                            {key === "kda" && record.match.deaths === 0
                              ? "Perfect"
                              : formatValue(key, record.value)}
                          </span>
                        </Link>
                      ))}
                      <span className="text-right font-display text-[15px] font-bold tabular-nums text-lol-win">
                        {row.bestWinStreak.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
