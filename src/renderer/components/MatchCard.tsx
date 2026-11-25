import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { ChampionData, MatchListItem } from "../../shared/api";
import { computeMatchScoreBreakdowns, type ScoreBreakdown } from "../../shared/opScore";
import { isArenaQueue, isAugmentQueue } from "../../shared/queues";
import { useChampionData, useRuneData } from "../hooks/useChampions";
import { parseParticipants, scoreInputsFor } from "../lib/participants";
import { ScoreBreakdownTooltip } from "./ScoreBreakdownTooltip";
import { formatDuration, formatNumber, formatTimeAgo, kdaRatio } from "../lib/format";
import { parseRuneIds, splitRuneSelections } from "../lib/runes";
import { parseAugmentIds } from "./AugmentGrid";
import AugmentIcon from "./AugmentIcon";
import ChampionIcon from "./ChampionIcon";
import ItemIcon from "./ItemIcon";
import { queueLabel } from "./QueueSelect";
import RuneIcon from "./RuneIcon";
import { RuneCompact } from "./RuneSetup";

// Shared by the header row and every card so the columns line up exactly:
// band | champion | score | KDA | damage | healed | tanked | gold | CS | build | augments | multikills
//
// Two layouts, switched by the list's own width (container query, not the window):
// below 1520px the first nine columns form row one and build | augments | multikills
// drop into a second row; from 1520px up everything sits in a single row.
const GRID =
  "grid-cols-[100px_minmax(150px,1.2fr)_64px_minmax(104px,0.8fr)_minmax(96px,1fr)_minmax(84px,0.9fr)_minmax(84px,0.9fr)_minmax(80px,0.7fr)_minmax(56px,0.5fr)] @min-[1520px]:grid-cols-[100px_minmax(170px,1.3fr)_72px_minmax(116px,0.8fr)_minmax(110px,1fr)_minmax(96px,0.9fr)_minmax(96px,0.9fr)_minmax(92px,0.7fr)_minmax(64px,0.5fr)_156px_120px_164px]";

// Container for the list; narrower than this the tab scrolls sideways as a last resort
export const MATCH_LIST_CLASS = "@container min-w-[1000px]";

const HEADERS = [
  "",
  "Champion",
  "Score",
  "KDA",
  "Damage",
  "Healed",
  "Tanked",
  "Gold",
  "CS",
  "Build",
  "Augments",
  "Multikills",
];

const MULTIKILLS = [
  { key: "double_kills", label: "Double", cls: "border-sky-400 bg-sky-500/25 text-sky-200" },
  { key: "triple_kills", label: "Triple", cls: "border-amber-400 bg-amber-500/25 text-amber-200" },
  {
    key: "quadra_kills",
    label: "Quadra",
    cls: "border-violet-400 bg-violet-500/30 text-violet-200",
  },
  { key: "penta_kills", label: "Penta", cls: "border-red-400 bg-red-500/30 text-red-200" },
] as const;

function scoreClass(score: number) {
  if (score >= 8) return "bg-lol-win/15 text-lol-win";
  if (score >= 7) return "bg-lol-gold/15 text-lol-gold";
  if (score >= 5) return "bg-white/[0.06] text-lol-text-bright";
  return "bg-lol-loss/15 text-lol-loss";
}

export function MatchCardHeader() {
  return (
    <div
      className={`mb-2 grid items-center gap-x-3 pr-4 text-[10.5px] font-bold uppercase tracking-widest text-lol-text ${GRID}`}
    >
      {HEADERS.map((h, i) => (
        <span
          key={i}
          className={`${i === 2 ? "text-center" : ""} ${i >= 9 ? "hidden @min-[1520px]:block" : ""}`}
        >
          {h}
        </span>
      ))}
    </div>
  );
}

// Total on top, a coloured line scaled to the best player in the game, rate underneath
function BarStat({
  total,
  perMin,
  pct,
  unit,
  barClass,
}: {
  total: number;
  perMin: string;
  pct: number;
  unit: string;
  barClass: string;
}) {
  return (
    <div className="pr-2">
      <div className="font-display text-[16px] font-bold tabular-nums text-lol-text-bright">
        {formatNumber(total)}
      </div>
      <div className="my-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[12px] tabular-nums text-lol-text">
        {perMin}
        <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide">{unit}</span>
      </div>
    </div>
  );
}

// One detail fetch per game, shared by every hover
const breakdownCache = new Map<number, Promise<ScoreBreakdown | null>>();

function loadBreakdown(
  match: MatchListItem,
  champData: ChampionData,
): Promise<ScoreBreakdown | null> {
  let cached = breakdownCache.get(match.game_id);
  if (!cached) {
    cached = window.api.getMatchDetail(match.game_id).then((detail) => {
      const players = parseParticipants(detail.participants, null);
      const classes: Record<number, string | undefined> = {};
      for (const p of players) classes[p.championId] = champData?.[p.championId]?.class;
      const scores = computeMatchScoreBreakdowns(scoreInputsFor(players, detail.game), classes);
      // The list row has no participant id; champion plus KDA identifies the player
      const self = players.find(
        (p) =>
          p.championId === match.champion_id &&
          p.kills === match.kills &&
          p.deaths === match.deaths &&
          p.assists === match.assists,
      );
      return (self && scores.get(self.participantId)) ?? null;
    });
    // A failed fetch must not stick: let the next hover retry
    cached.catch(() => breakdownCache.delete(match.game_id));
    breakdownCache.set(match.game_id, cached);
  }
  return cached;
}

function ScoreCell({ match, champData }: { match: MatchListItem; champData: ChampionData }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [breakdown, setBreakdown] = useState<ScoreBreakdown | null>(null);

  const show = (el: HTMLElement) => {
    setAnchor(el.getBoundingClientRect());
    loadBreakdown(match, champData)
      .then(setBreakdown)
      .catch(() => {});
  };

  return (
    <div
      className="flex cursor-help flex-col items-center gap-1"
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setAnchor(null)}
    >
      {match.score != null ? (
        <span
          className={`w-14 rounded-lg py-1.5 text-center font-display text-[18px] font-bold tabular-nums ${scoreClass(match.score)}`}
        >
          {match.score.toFixed(1)}
        </span>
      ) : (
        <span className="text-lol-text">—</span>
      )}
      {match.score_badge && (
        <span
          className={`rounded px-1.5 py-px font-display text-[10px] font-bold tracking-wide ${
            match.score_badge === "MVP"
              ? "bg-lol-gold text-[#241705]"
              : "bg-violet-400 text-[#150c33]"
          }`}
        >
          {match.score_badge}
        </span>
      )}
      {anchor && breakdown && <ScoreBreakdownTooltip breakdown={breakdown} anchor={anchor} />}
    </div>
  );
}

export function MatchCard({ match, championName }: { match: MatchListItem; championName: string }) {
  const navigate = useNavigate();
  const runeData = useRuneData();
  const champData = useChampionData();
  const isRemake = match.is_remake === 1;
  const isWin = !!match.win;
  const tone = isRemake ? "remake" : isWin ? "win" : "loss";
  const minutes = match.game_duration / 60;
  const perMin = (v: number) => (minutes > 0 ? formatNumber(Math.round(v / minutes)) : "—");
  const pctOf = (v: number, max: number) => (max > 0 ? Math.min(100, (v / max) * 100) : 0);
  const ratio = kdaRatio(match.kills, match.deaths, match.assists);
  const augmentIds = parseAugmentIds(match.augment_ids).slice(0, 6);
  // 1-3 augments sit in one row, 4 in a 2x2 block, 5-6 in two rows of three
  const augmentCols =
    augmentIds.length <= 3 ? Math.max(augmentIds.length, 1) : augmentIds.length === 4 ? 2 : 3;
  const runeIds = parseRuneIds(match.rune_ids);
  const runeSetup = splitRuneSelections(runeIds, match.primary_style, match.secondary_style);
  const items = [match.item0, match.item1, match.item2, match.item3, match.item4, match.item5];

  const open = () => navigate(`/match/${match.game_id}`);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  };

  const box = {
    win: "hover:border-lol-win/60 hover:shadow-[0_12px_30px_-18px_var(--theme-win)]",
    loss: "hover:border-lol-loss/60 hover:shadow-[0_12px_30px_-18px_var(--theme-loss)]",
    remake: "hover:border-lol-border-hover",
  }[tone];
  const band = {
    win: "bg-lol-win/15 text-lol-win border-lol-win/40",
    loss: "bg-lol-loss/15 text-lol-loss border-lol-loss/40",
    remake: "bg-white/[0.04] text-lol-text border-lol-border",
  }[tone];

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={onKeyDown}
      className={`grid cursor-pointer items-center gap-x-3 gap-y-3 overflow-hidden rounded-xl py-3 @min-[1520px]:min-h-[116px] @min-[1520px]:gap-y-0 @min-[1520px]:py-0 border border-lol-border bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_60%),color-mix(in_oklab,var(--theme-card)_40%,black)] pr-4 transition-all duration-150 hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-lol-gold ${GRID} ${box}`}
    >
      {/* Result band: the one strong colour block, full card height */}
      <div
        className={`-my-3 row-span-2 flex flex-col items-center justify-center gap-0.5 self-stretch border-r px-2 text-center @min-[1520px]:m-0 @min-[1520px]:row-span-1 ${band}`}
      >
        <span className="font-display text-[20px] font-bold uppercase tracking-wider">
          {isRemake ? "Remake" : isWin ? "Win" : "Loss"}
        </span>
        <span className="font-display text-[14px] font-semibold tabular-nums text-lol-text-bright">
          {formatDuration(match.game_duration)}
        </span>
        <span className="text-[11.5px] text-lol-text">{formatTimeAgo(match.game_creation)}</span>
      </div>

      <div className="flex min-w-0 items-center gap-3 py-3">
        <ChampionIcon
          championId={match.champion_id}
          size={68}
          className="h-[68px] w-[68px] shrink-0 rounded-lg border border-lol-border-hover object-cover"
        />
        <div className="min-w-0">
          <div className="truncate font-display text-[16px] font-semibold text-lol-text-bright">
            {championName}
          </div>
          <div className="truncate text-[12px] text-lol-text">{queueLabel(match.queue_id)}</div>
        </div>
      </div>

      <ScoreCell match={match} champData={champData} />

      <div>
        <div className="font-display text-[18px] font-bold tabular-nums text-lol-text-bright">
          {match.kills} / <span className="text-lol-loss">{match.deaths}</span> / {match.assists}
        </div>
        <div
          className={`text-[12.5px] font-semibold ${
            ratio === "Perfect" || parseFloat(ratio) >= 4 ? "text-lol-gold" : "text-lol-text"
          }`}
        >
          {ratio} KDA
        </div>
      </div>

      <BarStat
        total={match.total_damage_dealt}
        perMin={perMin(match.total_damage_dealt)}
        pct={pctOf(match.total_damage_dealt, match.game_max_dmg)}
        unit="dpm"
        barClass="bg-red-500"
      />
      <BarStat
        total={match.total_heal}
        perMin={perMin(match.total_heal)}
        pct={pctOf(match.total_heal, match.game_max_heal)}
        unit="hpm"
        barClass="bg-emerald-400"
      />
      <BarStat
        total={match.total_damage_taken}
        perMin={perMin(match.total_damage_taken)}
        pct={pctOf(match.total_damage_taken, match.game_max_taken)}
        unit="tpm"
        barClass="bg-sky-400"
      />

      <div>
        <div className="font-display text-[16px] font-bold tabular-nums text-lol-gold">
          {formatNumber(match.gold_earned)}
        </div>
        <div className="mt-1 text-[12px] tabular-nums text-lol-text">
          {perMin(match.gold_earned)}
          <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide">gpm</span>
        </div>
      </div>

      <div>
        {isArenaQueue(match.queue_id) ? (
          <span className="text-lol-text">—</span>
        ) : (
          <>
            <div className="font-display text-[16px] font-bold tabular-nums text-lol-text-bright">
              {match.cs ?? 0}
            </div>
            <div className="mt-1 text-[12px] tabular-nums text-lol-text">
              {minutes > 0 ? `${((match.cs ?? 0) / minutes).toFixed(1)}/min` : ""}
            </div>
          </>
        )}
      </div>

      {/* Six items in two rows of three, trinket on its own beside them */}
      <div className="col-span-2 flex items-center gap-2 @min-[1520px]:col-span-1">
        <div className="grid grid-cols-3 gap-1">
          {items.map((id, i) => (
            <ItemIcon key={i} itemId={id ?? 0} size={34} patch={match.game_version} />
          ))}
        </div>
        <ItemIcon itemId={match.item6 ?? 0} size={34} patch={match.game_version} />
      </div>

      <div className="col-span-3 flex items-center justify-start @min-[1520px]:col-span-1 @min-[1520px]:justify-center">
        {isAugmentQueue(match.queue_id) ? (
          <div
            // One row in the compact layout, the balanced block in the wide one
            className="grid gap-1 [grid-template-columns:repeat(var(--all),36px)] @min-[1520px]:[grid-template-columns:repeat(var(--cols),36px)]"
            style={
              {
                "--all": Math.max(augmentIds.length, 1),
                "--cols": augmentCols,
              } as CSSProperties
            }
          >
            {augmentIds.map((id, i) => (
              <div key={i} className="h-9 w-9 overflow-hidden rounded-lg border border-lol-gold/40">
                <AugmentIcon augmentId={id} size={36} patch={match.game_version} />
              </div>
            ))}
          </div>
        ) : (
          <RuneCompact
            runeIds={runeIds}
            primaryStyle={match.primary_style}
            secondaryStyle={match.secondary_style}
            statShardIds={parseRuneIds(match.stat_shard_ids)}
            runeData={runeData}
            version={match.game_version}
          >
            <span className="flex items-center gap-1 rounded-lg border border-lol-gold/40 bg-white/[0.02] p-1">
              <RuneIcon
                runeId={runeSetup.keystone}
                path={runeData[runeSetup.keystone ?? 0]?.icon}
                version={match.game_version}
                size={32}
              />
              <RuneIcon
                runeId={match.secondary_style}
                path={runeData[match.secondary_style ?? 0]?.icon}
                version={match.game_version}
                size={22}
              />
            </span>
          </RuneCompact>
        )}
      </div>

      <div className="col-span-3 flex flex-wrap content-center gap-1 @min-[1520px]:col-span-1 @min-[1520px]:grid @min-[1520px]:grid-cols-2 @min-[1520px]:py-2">
        {MULTIKILLS.map(({ key, label, cls }) =>
          match[key] > 0 ? (
            <span
              key={key}
              className={`w-[78px] rounded-full border py-0.5 text-center font-display text-[11.5px] font-bold ${cls}`}
            >
              {label} ×{match[key]}
            </span>
          ) : null,
        )}
      </div>
    </article>
  );
}
