import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { MatchDetail, ParsedParticipant } from "../lib/types";
import { parseParticipants, groupByTeam, scoreInputsFor } from "../lib/participants";
import { getChampionName, useRuneData } from "../hooks/useChampions";
import { formatKDA, formatNumber, kdaRatio } from "../lib/format";
import { isArenaQueue, isAugmentQueue } from "../../shared/queues";
import { computeMatchScoreBreakdowns, scoreColor, type ScoreBreakdown } from "../../shared/opScore";
import { ScoreBreakdownTooltip } from "./ScoreBreakdownTooltip";
import ChampionIcon from "./ChampionIcon";
import AugmentIcon from "./AugmentIcon";
import ItemIcon from "./ItemIcon";
import { RuneSetupGrid } from "./RuneSetup";
import SummonerSpellIcon from "./SummonerSpellIcon";

// player | score | KDA | damage | healed | tanked | gold | CS | build | augments or runes
const GRID_COLS =
  "grid-cols-[minmax(230px,1.5fr)_64px_minmax(110px,0.8fr)_minmax(100px,1fr)_minmax(90px,0.9fr)_minmax(90px,0.9fr)_minmax(80px,0.7fr)_minmax(56px,0.5fr)_150px_minmax(120px,0.8fr)]";

export default function MatchScoreboard({
  detail,
  champData,
  puuids,
  onPlayerClick,
}: {
  detail: MatchDetail;
  champData: any;
  puuids: string[] | null;
  onPlayerClick?: (player: {
    puuid: string | null;
    gameName: string | null;
    tagLine: string | null;
  }) => void;
}) {
  const participants = useMemo(
    () => parseParticipants(detail.participants, puuids),
    [detail, puuids],
  );
  const teams = useMemo(() => groupByTeam(participants), [participants]);
  const scores = useMemo(() => {
    const classes: Record<number, string | undefined> = {};
    for (const p of participants) classes[p.championId] = champData?.[p.championId]?.class;
    return computeMatchScoreBreakdowns(scoreInputsFor(participants, detail.game), classes);
  }, [participants, champData, detail.game]);

  const gameMaxStats = useMemo(() => {
    let dmg = 0,
      taken = 0,
      gold = 0,
      heal = 0;
    for (const p of participants) {
      if (p.totalDamageDealtToChampions > dmg) dmg = p.totalDamageDealtToChampions;
      if (p.totalDamageTaken > taken) taken = p.totalDamageTaken;
      if (p.goldEarned > gold) gold = p.goldEarned;
      if (p.totalHeal > heal) heal = p.totalHeal;
    }
    return { dmg: dmg || 1, taken: taken || 1, gold: gold || 1, heal: heal || 1 };
  }, [participants]);

  if (participants.length === 0) {
    return (
      <div className="text-sm text-lol-text text-center py-4">Full game data not available.</div>
    );
  }

  if (isArenaQueue(detail.game.queue_id)) {
    return (
      <div className="@container">
        <div className={FIT_ZOOM}>
          <ArenaScoreboard
            participants={participants}
            champData={champData}
            patch={detail.game.game_version}
            gameDuration={detail.game.game_duration}
            onPlayerClick={onPlayerClick}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="@container">
      <div className={`space-y-3 ${FIT_ZOOM}`}>
        {Array.from(teams.entries()).map(([teamId, players]) => (
          <TeamScoreboard
            key={teamId}
            teamId={teamId}
            players={players}
            maxStats={gameMaxStats}
            champData={champData}
            scores={scores}
            patch={detail.game.game_version}
            gameDuration={detail.game.game_duration}
            queueId={detail.game.queue_id}
            onPlayerClick={onPlayerClick}
          />
        ))}
      </div>
    </div>
  );
}

// The rows need ~1260px; narrower than that the whole table scales down instead of being clipped.
// shortcut: fixed steps that fit down to ~910px, add a stacked layout if the window can get narrower.
const FIT_ZOOM = "@max-[1260px]:[zoom:0.9] @max-[1134px]:[zoom:0.8] @max-[1008px]:[zoom:0.72]";

const ARENA_GRID_COLS =
  "grid-cols-[28px_minmax(140px,240px)_64px_minmax(140px,220px)_minmax(140px,220px)_56px_56px_240px_220px_1fr]";

function ArenaScoreboard({
  participants,
  champData,
  patch,
  gameDuration,
  onPlayerClick,
}: {
  participants: ParsedParticipant[];
  champData: any;
  patch?: string | null;
  gameDuration: number;
  onPlayerClick?: (player: {
    puuid: string | null;
    gameName: string | null;
    tagLine: string | null;
  }) => void;
}) {
  const subteams = useMemo(() => {
    const hasSubteams = participants.some((p) => p.playerSubteamId != null);

    if (!hasSubteams) {
      // Payload has no subteam ids: the game predates the v10 migration, or
      // Riot simply did not include them. Fall back to one row per player so
      // the layout is still informative rather than a single 3x3 block.
      return participants.map((p) => ({
        subteamId: p.participantId,
        players: [p],
        placement: p.playerSubteamPlacement ?? null,
      }));
    }

    const map = new Map<number, ParsedParticipant[]>();
    for (const p of participants) {
      const key = p.playerSubteamId ?? p.teamId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()]
      .map(([subteamId, players]) => {
        const placement = players[0]?.playerSubteamPlacement ?? null;
        return { subteamId, players, placement };
      })
      .sort((a, b) => {
        if (a.placement == null && b.placement == null) return a.subteamId - b.subteamId;
        if (a.placement == null) return 1;
        if (b.placement == null) return -1;
        return a.placement - b.placement;
      });
  }, [participants]);

  return (
    <div className="space-y-3">
      {subteams.map(({ subteamId, players, placement }) => (
        <ArenaTeamBlock
          key={subteamId}
          subteamId={subteamId}
          placement={placement}
          players={players}
          champData={champData}
          patch={patch}
          gameDuration={gameDuration}
          onPlayerClick={onPlayerClick}
        />
      ))}
    </div>
  );
}

const PLACEMENT_ORDINALS: Record<number, string> = {
  1: "First place",
  2: "Second place",
  3: "Third place",
  4: "Fourth place",
  5: "Fifth place",
  6: "Sixth place",
};

function placementLabel(placement: number | null, subteamId: number): string {
  if (placement == null) return `Team ${subteamId}`;
  return PLACEMENT_ORDINALS[placement] ?? `Placement ${placement}`;
}

function ArenaTeamBlock({
  subteamId,
  placement,
  players,
  champData,
  patch,
  gameDuration,
  onPlayerClick,
}: {
  subteamId: number;
  placement: number | null;
  players: ParsedParticipant[];
  champData: any;
  patch?: string | null;
  gameDuration: number;
  onPlayerClick?: (player: {
    puuid: string | null;
    gameName: string | null;
    tagLine: string | null;
  }) => void;
}) {
  const isTopThree = placement != null ? placement <= 3 : (players[0]?.win ?? false);
  const totals = players.reduce(
    (acc, p) => {
      acc.kills += p.kills;
      acc.deaths += p.deaths;
      acc.assists += p.assists;
      acc.dmg += p.totalDamageDealtToChampions;
      acc.taken += p.totalDamageTaken;
      acc.gold += p.goldEarned;
      acc.heal += p.totalHeal;
      return acc;
    },
    { kills: 0, deaths: 0, assists: 0, dmg: 0, taken: 0, gold: 0, heal: 0 },
  );

  return (
    <div className="app-tile overflow-hidden p-0">
      <div
        className={`px-4 py-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 ${
          isTopThree
            ? "bg-gradient-to-r from-lol-win/15 via-lol-win/5 to-transparent"
            : "bg-gradient-to-r from-lol-loss/15 via-lol-loss/5 to-transparent"
        }`}
      >
        <span
          className={`text-sm font-display font-bold uppercase tracking-wider ${
            isTopThree ? "text-lol-win" : "text-lol-loss"
          }`}
        >
          {placementLabel(placement, subteamId)}
          {isTopThree ? " — Victory" : " — Defeat"}
        </span>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <div className="flex items-baseline rounded-lg bg-black/25 px-2.5 py-1">
            <TeamStat label="KDA">
              <span className="text-lol-text-bright">
                {formatKDA(totals.kills, totals.deaths, totals.assists)}
              </span>
            </TeamStat>
          </div>
          <div className="flex items-baseline rounded-lg bg-black/25 px-2.5 py-1">
            <TeamStat label="Damage">
              <span className="text-red-400">{compact(totals.dmg)}</span>
            </TeamStat>
          </div>
          <div className="flex items-baseline rounded-lg bg-black/25 px-2.5 py-1">
            <TeamStat label="Taken">
              <span className="text-sky-400">{compact(totals.taken)}</span>
            </TeamStat>
          </div>
          <div className="flex items-baseline rounded-lg bg-black/25 px-2.5 py-1">
            <TeamStat label="Gold">
              <span className="text-lol-gold">{compact(totals.gold)}</span>
            </TeamStat>
          </div>
          <div className="flex items-baseline rounded-lg bg-black/25 px-2.5 py-1">
            <TeamStat label="Heal">
              <span className="text-emerald-400">{compact(totals.heal)}</span>
            </TeamStat>
          </div>
        </div>
      </div>
      <div
        className={`h-0.5 bg-gradient-to-r ${
          isTopThree
            ? "from-lol-win/40 via-lol-win/15 to-transparent"
            : "from-lol-loss/40 via-lol-loss/15 to-transparent"
        }`}
      />

      <div
        className={`px-4 py-1.5 border-b border-lol-border/40 grid ${ARENA_GRID_COLS} gap-2 items-center text-[10px] font-bold text-lol-text uppercase tracking-wider bg-white/[0.015]`}
      >
        <span></span>
        <span className="text-left">Player</span>
        <span className="text-center">KDA</span>
        <span className="text-right">Damage</span>
        <span className="text-right">Taken</span>
        <span className="text-right">Gold</span>
        <span className="text-right">Heal</span>
        <span className="text-center">Items</span>
        <span className="text-center">Augments</span>
        <span aria-hidden="true" />
      </div>

      {players.map((p) => (
        <ArenaPlayerRow
          key={p.participantId}
          player={p}
          placement={placement}
          maxStats={{
            dmg: Math.max(1, ...players.map((x) => x.totalDamageDealtToChampions)),
            taken: Math.max(1, ...players.map((x) => x.totalDamageTaken)),
          }}
          champData={champData}
          patch={patch}
          gameDuration={gameDuration}
          onPlayerClick={onPlayerClick}
        />
      ))}
    </div>
  );
}

function ArenaPlayerRow({
  player: p,
  placement,
  maxStats,
  champData,
  patch,
  gameDuration: _gameDuration,
  onPlayerClick,
}: {
  player: ParsedParticipant;
  placement: number | null;
  maxStats: { dmg: number; taken: number };
  champData: any;
  patch?: string | null;
  gameDuration: number;
  onPlayerClick?: (player: {
    puuid: string | null;
    gameName: string | null;
    tagLine: string | null;
  }) => void;
}) {
  const kda = kdaRatio(p.kills, p.deaths, p.assists);
  return (
    <div
      className={`px-4 py-2 border-b border-lol-border/20 last:border-b-0 grid ${ARENA_GRID_COLS} gap-2 items-center transition-colors hover:bg-white/[0.03] ${
        p.isSelf ? "border-l-2 border-l-lol-gold bg-lol-gold/[0.06]" : ""
      }`}
    >
      <div className="relative flex items-center gap-0.5">
        <ChampionIcon
          championId={p.championId}
          size={34}
          className="rounded-lg ring-1 ring-lol-border"
        />
        <div className="flex flex-col gap-0.5">
          <div className="rounded-md border border-lol-border/50 bg-black/30 p-0.5">
            <SummonerSpellIcon spellId={p.spell1Id} size={15} />
          </div>
          <div className="rounded-md border border-lol-border/50 bg-black/30 p-0.5">
            <SummonerSpellIcon spellId={p.spell2Id} size={15} />
          </div>
        </div>
        <span className="absolute -left-1 -top-1 text-[9px] font-semibold text-lol-text-bright">
          {placement != null ? placement : "—"}
        </span>
      </div>

      <div className="min-w-0">
        <button
          type="button"
          onClick={() => {
            if (!onPlayerClick) return;
            onPlayerClick({
              puuid: p.puuid,
              gameName: p.gameName ?? null,
              tagLine: p.tagLine ?? null,
            });
          }}
          disabled={!onPlayerClick || !p.puuid}
          className={`text-xs font-display truncate text-left max-w-full transition-colors ${
            p.isSelf ? "text-lol-gold font-semibold" : "text-lol-text-bright"
          } ${onPlayerClick && p.puuid ? "cursor-pointer hover:text-lol-gold" : "cursor-default"}`}
          title={p.gameName && p.tagLine ? `${p.gameName}#${p.tagLine}` : undefined}
        >
          {p.summonerName}
        </button>
        <div className="text-[10px] font-display text-lol-text truncate transition-colors hover:text-lol-gold">
          {getChampionName(champData, p.championId)}
        </div>
      </div>

      <div className="text-center">
        <div className="whitespace-nowrap font-display text-[13px] font-semibold text-lol-text-bright">
          {formatKDA(p.kills, p.deaths, p.assists)}
        </div>
        <div
          className={`text-[11px] ${
            parseFloat(kda) >= 3 || kda === "Perfect" ? "text-lol-gold" : "text-lol-text"
          }`}
        >
          {kda}
        </div>
      </div>

      <ScoreboardBar value={p.totalDamageDealtToChampions} max={maxStats.dmg} color="bg-lol-loss" />
      <ScoreboardBar value={p.totalDamageTaken} max={maxStats.taken} color="bg-lol-assist" />

      <div className="text-right font-display text-[12.5px] font-semibold text-lol-gold">
        {p.goldEarned >= 1000 ? `${(p.goldEarned / 1000).toFixed(1)}k` : p.goldEarned}
      </div>
      <div className="text-right font-display text-[12.5px] font-semibold text-lol-win">
        {p.totalHeal >= 1000 ? `${(p.totalHeal / 1000).toFixed(1)}k` : p.totalHeal}
      </div>

      <div className="flex gap-0.5 justify-center">
        {p.items.slice(0, 6).map((itemId, i) => (
          <div key={i} className="rounded-md border border-lol-border/50 bg-black/30 p-0.5">
            <ItemIcon itemId={itemId} size={22} patch={patch} />
          </div>
        ))}
        <div className="ml-0.5 rounded-md border border-lol-border/50 bg-black/30 p-0.5">
          <ItemIcon itemId={p.items[6] ?? 0} size={22} patch={patch} />
        </div>
      </div>

      <div className="flex items-center gap-1 justify-center">
        {p.augments.map((augId, i) => (
          <div key={i} className="rounded-md border border-lol-border/50 bg-black/30 p-0.5">
            <AugmentIcon augmentId={augId} size={22} patch={patch} />
          </div>
        ))}
      </div>
      <div aria-hidden="true" />
    </div>
  );
}

function TeamScoreboard({
  teamId,
  players,
  maxStats,
  champData,
  scores,
  patch,
  gameDuration,
  queueId,
  onPlayerClick,
}: {
  teamId: number;
  players: ParsedParticipant[];
  maxStats: { dmg: number; taken: number; gold: number; heal: number };
  champData: any;
  scores: Map<number, ScoreBreakdown>;
  patch?: string | null;
  gameDuration: number;
  queueId: number;
  onPlayerClick?: (player: {
    puuid: string | null;
    gameName: string | null;
    tagLine: string | null;
  }) => void;
}) {
  const showAugments = isAugmentQueue(queueId);
  const isWin = players[0]?.win ?? false;
  const totals = useMemo(() => computeTeamTotals(players, scores), [players, scores]);

  return (
    <div
      className="app-tile app-tile-featured overflow-hidden p-0"
      style={{ "--tile-accent": isWin ? "var(--theme-win)" : "var(--theme-loss)" } as CSSProperties}
    >
      {/* Team header: name on the left, team totals filling the rest of the bar */}
      <div
        className={`px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 ${isWin ? "bg-gradient-to-r from-lol-win/30 via-lol-win/10 to-transparent" : "bg-gradient-to-r from-lol-loss/30 via-lol-loss/10 to-transparent"}`}
      >
        <span
          className={`text-[15px] font-display font-bold uppercase tracking-wider ${isWin ? "text-lol-win" : "text-lol-loss"}`}
        >
          Team {teamId === 100 ? "1" : "2"} — {isWin ? "Victory" : "Defeat"}
        </span>
        <div className="ml-auto flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <div className="flex items-baseline rounded-lg bg-black/25 px-2.5 py-1">
            <TeamStat label="Avg score">
              <span
                className={totals.avgScore != null ? scoreColor(totals.avgScore) : "text-lol-text"}
              >
                {totals.avgScore != null ? totals.avgScore.toFixed(1) : "-"}
              </span>
            </TeamStat>
          </div>
          <div className="flex items-baseline rounded-lg bg-black/25 px-2.5 py-1">
            <TeamStat label="KDA">
              <span className="text-lol-text-bright">
                {formatKDA(totals.kills, totals.deaths, totals.assists)}
              </span>
            </TeamStat>
          </div>
          <div className="flex items-baseline rounded-lg bg-black/25 px-2.5 py-1">
            <TeamStat label="Damage">
              <span className="text-red-400">{compact(totals.dmg)}</span>
            </TeamStat>
          </div>
          <div className="flex items-baseline rounded-lg bg-black/25 px-2.5 py-1">
            <TeamStat label="Taken">
              <span className="text-sky-400">{compact(totals.taken)}</span>
            </TeamStat>
          </div>
          <div className="flex items-baseline rounded-lg bg-black/25 px-2.5 py-1">
            <TeamStat label="CS">
              <span className="text-lol-text-bright">{formatNumber(totals.cs)}</span>
            </TeamStat>
          </div>
          <div className="flex items-baseline rounded-lg bg-black/25 px-2.5 py-1">
            <TeamStat label="Gold">
              <span className="text-lol-gold">{compact(totals.gold)}</span>
            </TeamStat>
          </div>
          <div className="flex items-baseline rounded-lg bg-black/25 px-2.5 py-1">
            <TeamStat label="Heal">
              <span className="text-emerald-400">{compact(totals.heal)}</span>
            </TeamStat>
          </div>
        </div>
      </div>
      <div
        className={`h-0.5 bg-gradient-to-r ${
          isWin
            ? "from-lol-win/40 via-lol-win/15 to-transparent"
            : "from-lol-loss/40 via-lol-loss/15 to-transparent"
        }`}
      />

      {/* Column headers */}
      <div className="p-3 pt-2">
        <div
          className={`mb-2 grid ${GRID_COLS} items-center gap-x-3 px-3 text-[10.5px] font-bold uppercase tracking-widest text-lol-text`}
        >
          <span>Player</span>
          <span className="text-center">Score</span>
          <span>KDA</span>
          <span>Damage</span>
          <span>Healed</span>
          <span>Tanked</span>
          <span>Gold</span>
          <span>CS</span>
          <span>Build</span>
          <span>{showAugments ? "Augments" : "Runes"}</span>
        </div>

        <div className="flex flex-col gap-2">
          {players.map((p) => (
            <PlayerRow
              key={p.participantId}
              player={p}
              maxStats={maxStats}
              champData={champData}
              score={scores.get(p.participantId)}
              patch={patch}
              gameDuration={gameDuration}
              showAugments={showAugments}
              onPlayerClick={onPlayerClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function computeTeamTotals(players: ParsedParticipant[], scores: Map<number, ScoreBreakdown>) {
  const t = {
    kills: 0,
    deaths: 0,
    assists: 0,
    dmg: 0,
    taken: 0,
    cs: 0,
    gold: 0,
    heal: 0,
    avgScore: null as number | null,
  };
  let scoreSum = 0,
    scored = 0;

  for (const p of players) {
    t.kills += p.kills;
    t.deaths += p.deaths;
    t.assists += p.assists;
    t.dmg += p.totalDamageDealtToChampions;
    t.taken += p.totalDamageTaken;
    t.cs += p.cs;
    t.gold += p.goldEarned;
    t.heal += p.totalHeal;
    const s = scores.get(p.participantId);
    if (s) {
      scoreSum += s.score;
      scored++;
    }
  }
  if (scored > 0) t.avgScore = scoreSum / scored;
  return t;
}

function TeamStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-[10px] font-bold uppercase tracking-wider text-lol-text">{label}</span>
      <span className="font-display text-[12.5px] font-semibold tabular-nums">{children}</span>
    </div>
  );
}

// Value on top, a thin bar under it: the number stays readable at any fill and the columns line up.
function ScoreboardBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-right font-display text-[12px] font-semibold tabular-nums text-lol-text-bright">
        {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
      </span>
      <div className="h-1 overflow-hidden rounded-full bg-white/[0.07]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Same card look as the Match History list: dark card, value on top, a coloured line scaled to the
// best player in the game, per-minute rate underneath.
const CARD_CLASS =
  "grid items-center gap-x-3 rounded-xl border border-lol-border bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_60%),color-mix(in_oklab,var(--theme-card)_40%,black)] px-3 py-2.5 transition-colors hover:border-lol-border-hover";

function scoreClass(score: number) {
  if (score >= 8) return "bg-lol-win/15 text-lol-win";
  if (score >= 7) return "bg-lol-gold/15 text-lol-gold";
  if (score >= 5) return "bg-white/[0.06] text-lol-text-bright";
  return "bg-lol-loss/15 text-lol-loss";
}

function BarStat({
  total,
  max,
  perMin,
  unit,
  color,
}: {
  total: number;
  max: number;
  perMin: string;
  unit: string;
  color: string;
}) {
  const pct = max > 0 ? Math.min(100, (total / max) * 100) : 0;
  return (
    <div className="pr-2">
      <div className="font-display text-[16px] font-bold tabular-nums text-lol-text-bright">
        {formatNumber(total)}
      </div>
      <div className="my-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[12px] tabular-nums text-lol-text">
        {perMin}
        <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide">{unit}</span>
      </div>
    </div>
  );
}

function PlayerRow({
  player: p,
  maxStats,
  champData,
  score,
  patch,
  gameDuration,
  showAugments,
  onPlayerClick,
}: {
  player: ParsedParticipant;
  maxStats: { dmg: number; taken: number; gold: number; heal: number };
  champData: any;
  score?: ScoreBreakdown;
  patch?: string | null;
  gameDuration: number;
  showAugments: boolean;
  onPlayerClick?: (player: {
    puuid: string | null;
    gameName: string | null;
    tagLine: string | null;
  }) => void;
}) {
  const kda = kdaRatio(p.kills, p.deaths, p.assists);
  const runeData = useRuneData();
  const minutes = Math.max(gameDuration / 60, 1 / 60);
  const perMin = (v: number) => formatNumber(Math.round(v / minutes));

  return (
    <div
      className={`${CARD_CLASS} ${GRID_COLS} ${
        p.win
          ? "shadow-[inset_4px_0_0_var(--theme-win)]"
          : "shadow-[inset_4px_0_0_var(--theme-loss)]"
      } ${p.isSelf ? "!border-lol-gold/70 bg-lol-gold/[0.05]" : ""}`}
    >
      {/* Champion, summoner spells and names */}
      <div className="flex min-w-0 items-center gap-3">
        <ChampionIcon
          championId={p.championId}
          size={56}
          className="h-14 w-14 shrink-0 rounded-lg border border-lol-border-hover object-cover"
        />
        <div className="flex shrink-0 flex-col gap-1">
          {[p.spell1Id, p.spell2Id].map((spell, i) => (
            <div key={i} className="rounded-md border border-lol-border/50 bg-black/30 p-0.5">
              <SummonerSpellIcon spellId={spell} size={22} />
            </div>
          ))}
        </div>
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => {
              if (!onPlayerClick) return;
              onPlayerClick({
                puuid: p.puuid,
                gameName: p.gameName ?? null,
                tagLine: p.tagLine ?? null,
              });
            }}
            disabled={!onPlayerClick || !p.puuid}
            className={`block max-w-full truncate text-left font-display text-[15px] font-semibold transition-colors ${
              p.isSelf ? "text-lol-gold" : "text-lol-text-bright hover:text-lol-gold"
            } ${onPlayerClick && p.puuid ? "cursor-pointer" : "cursor-default"}`}
            title={p.gameName && p.tagLine ? `${p.gameName}#${p.tagLine}` : undefined}
          >
            {p.summonerName}
          </button>
          <div className="truncate text-[12px] text-lol-text">
            {getChampionName(champData, p.championId)}
          </div>
        </div>
      </div>

      <ScoreCell score={score} />

      <div>
        <div className="whitespace-nowrap font-display text-[18px] font-bold tabular-nums text-lol-text-bright">
          {p.kills} / <span className="text-lol-loss">{p.deaths}</span> / {p.assists}
        </div>
        <div
          className={`text-[12.5px] font-semibold ${
            parseFloat(kda) >= 4 || kda === "Perfect" ? "text-lol-gold" : "text-lol-text"
          }`}
        >
          {kda} KDA
        </div>
      </div>

      <BarStat
        total={p.totalDamageDealtToChampions}
        max={maxStats.dmg}
        perMin={perMin(p.totalDamageDealtToChampions)}
        unit="dpm"
        color="bg-red-500"
      />
      <BarStat
        total={p.totalHeal}
        max={maxStats.heal}
        perMin={perMin(p.totalHeal)}
        unit="hpm"
        color="bg-emerald-400"
      />
      <BarStat
        total={p.totalDamageTaken}
        max={maxStats.taken}
        perMin={perMin(p.totalDamageTaken)}
        unit="tpm"
        color="bg-sky-400"
      />

      <div>
        <div className="font-display text-[16px] font-bold tabular-nums text-lol-gold">
          {formatNumber(p.goldEarned)}
        </div>
        <div className="mt-1 text-[12px] tabular-nums text-lol-text">
          {perMin(p.goldEarned)}
          <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide">gpm</span>
        </div>
      </div>

      <div>
        <div className="font-display text-[16px] font-bold tabular-nums text-lol-text-bright">
          {p.cs}
        </div>
        <div className="mt-1 text-[12px] tabular-nums text-lol-text">
          {(p.cs / minutes).toFixed(1)}/min
        </div>
      </div>

      {/* Six items in two rows of three, trinket on its own beside them */}
      <div className="flex items-center gap-2">
        <div className="grid grid-cols-3 gap-1">
          {p.items.slice(0, 6).map((itemId, i) => (
            <ItemIcon key={i} itemId={itemId} size={30} patch={patch} />
          ))}
        </div>
        <ItemIcon itemId={p.items[6] ?? 0} size={30} patch={patch} />
      </div>

      {/* Runes for standard queues; Arena/Mayhem show Augments instead — those
          modes have no rune page at all, so falling back to "runes present?"
          per player would silently show an empty grid for the whole lobby. */}
      <div className="flex items-center gap-1">
        {showAugments ? (
          <div className="grid grid-cols-[repeat(3,36px)] gap-1">
            {p.augments.map((augId, i) => (
              <div key={i} className="h-9 w-9 overflow-hidden rounded-lg border border-lol-gold/40">
                <AugmentIcon augmentId={augId} size={36} patch={patch} />
              </div>
            ))}
          </div>
        ) : (
          <RuneSetupGrid
            runeIds={p.runeIds}
            primaryStyle={p.primaryStyle}
            secondaryStyle={p.secondaryStyle}
            statShardIds={p.statShardIds}
            runeData={runeData}
            version={patch}
          />
        )}
      </div>
    </div>
  );
}

function ScoreCell({ score }: { score?: ScoreBreakdown }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  return (
    <div
      className={`flex flex-col items-center gap-1 ${score ? "cursor-help" : ""}`}
      onMouseEnter={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => setAnchor(null)}
    >
      <span
        className={`w-14 rounded-lg py-1.5 text-center font-display text-[18px] font-bold tabular-nums ${
          score ? scoreClass(score.score) : "text-lol-text"
        }`}
      >
        {score ? score.score.toFixed(1) : "—"}
      </span>
      {score?.badge && (
        <span
          className={`rounded px-1.5 py-px font-display text-[10px] font-bold tracking-wide ${
            score.badge === "MVP" ? "bg-lol-gold text-[#241705]" : "bg-violet-400 text-[#150c33]"
          }`}
        >
          {score.badge}
        </span>
      )}
      {score && anchor && <ScoreBreakdownTooltip breakdown={score} anchor={anchor} />}
    </div>
  );
}

const compact = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toString());
