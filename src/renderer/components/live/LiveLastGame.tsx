import { useEffect, useState } from "react";
import type { LiveStatRecord, MatchListItem } from "../../../shared/api";
import { QUEUE_LABELS } from "../../../shared/queues";
import { formatNumber, formatTimeAgo } from "../../lib/format";
import { fmtClock, kdaRatio } from "../../lib/live";
import AugmentIcon from "../AugmentIcon";
import { parseAugmentIds } from "../AugmentGrid";
import ChampionIcon from "../ChampionIcon";
import ItemIcon from "../ItemIcon";
import { Panel } from "../Panel";
import { StatIcon, Title } from "./shared";

// Stats worth showing for a finished game, in this order, with how to print them. Values that the API
// reports as fractions (crit chance, tenacity) are shown as percentages.
const PEAK_ROWS: Array<{ key: string; label: string; fmt: "int" | "pct" | "dec" }> = [
  { key: "attackDamage", label: "Attack damage", fmt: "int" },
  { key: "abilityPower", label: "Ability power", fmt: "int" },
  { key: "attackSpeed", label: "Attack speed", fmt: "dec" },
  { key: "abilityHaste", label: "Ability haste", fmt: "int" },
  { key: "critChance", label: "Crit chance", fmt: "pct" },
  { key: "armor", label: "Armor", fmt: "int" },
  { key: "magicResist", label: "Magic resist", fmt: "int" },
  { key: "maxHealth", label: "Max health", fmt: "int" },
  { key: "effectiveHpPhysical", label: "Effective HP (phys)", fmt: "int" },
  { key: "effectiveHpMagic", label: "Effective HP (magic)", fmt: "int" },
  { key: "moveSpeed", label: "Move speed", fmt: "int" },
  { key: "lifeSteal", label: "Life steal", fmt: "pct" },
  { key: "omnivamp", label: "Omnivamp", fmt: "pct" },
  { key: "tenacity", label: "Tenacity", fmt: "pct" },
  { key: "gold", label: "Gold held", fmt: "int" },
];

function formatPeak(value: number, fmt: "int" | "pct" | "dec"): string {
  if (fmt === "pct") return `${Math.round(value <= 1 ? value * 100 : value)}%`;
  if (fmt === "dec") return (Math.round(value * 100) / 100).toString();
  return Math.round(value).toLocaleString();
}

function Metric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-lol-border/60 bg-black/25 px-3 py-2">
      <div className="font-display text-[10px] font-bold uppercase tracking-widest text-lol-text">
        {label}
      </div>
      <div
        className={`font-display text-[17px] font-bold tabular-nums ${tone || "text-lol-text-bright"}`}
      >
        {value}
      </div>
    </div>
  );
}

// The most recent stored game with everything the post-game screen gave us (damage, augments, items),
// plus how strong your champion got in it, as recorded while it was being played.
export function LiveLastGame() {
  const [match, setMatch] = useState<MatchListItem | null>(null);
  const [peaks, setPeaks] = useState<Array<{ stat: string; peak: number; final: number }>>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      window.api
        .getHomeMatchList("all", undefined, 1)
        .then((p) => {
          if (!cancelled) setMatch(p.matches[0] ?? null);
        })
        .catch(() => {});
    void load();
    const off = window.api.onGamesUpdated(() => void load());
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  const gameId = match?.game_id;
  useEffect(() => {
    if (gameId == null) return;
    let cancelled = false;
    let tries = 0;
    let timer: number | undefined;
    // The stats are written a few seconds after the game ends, so an empty answer is retried for a while
    const load = async () => {
      const rows = await window.api.getGameStatPeaks(gameId).catch(() => []);
      if (cancelled) return;
      setPeaks(rows);
      if (rows.length === 0 && ++tries < 6) timer = window.setTimeout(load, 10_000);
    };
    setPeaks([]);
    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [gameId]);

  // Your best value of each stat on this champion, to tell whether this game set a record
  const championId = match?.champion_id;
  const [records, setRecords] = useState<Map<string, LiveStatRecord>>(new Map());
  useEffect(() => {
    if (championId == null) return;
    let cancelled = false;
    window.api
      .getStatRecords({ championId })
      .then((rows) => {
        if (!cancelled) setRecords(new Map(rows.map((r) => [r.stat, r])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Re-read once this game's stats arrive, since they may be the new record
  }, [championId, peaks.length]);

  if (!match) return null;
  const augments = parseAugmentIds(match.augment_ids);
  const items = [
    match.item0,
    match.item1,
    match.item2,
    match.item3,
    match.item4,
    match.item5,
    match.item6,
  ].filter((id): id is number => typeof id === "number" && id > 0);
  const peakBy = new Map(peaks.map((r) => [r.stat, r.peak]));
  const win = match.win === 1;
  const minutes = Math.max(match.game_duration / 60, 1 / 60);

  return (
    <Panel variant="tile" accent={win ? "var(--color-lol-win)" : "var(--color-lol-loss)"}>
      <Title
        aside={
          <span className="text-[13px] text-lol-text">
            {QUEUE_LABELS[match.queue_id] ?? `Queue ${match.queue_id}`} ·{" "}
            {formatTimeAgo(match.game_creation)}
          </span>
        }
      >
        Last game
      </Title>

      <div className="flex flex-wrap items-center gap-5">
        <ChampionIcon championId={match.champion_id} size={64} className="rounded-2xl" />
        <div>
          <div
            className={`font-display text-[24px] font-bold leading-tight ${win ? "text-lol-win" : "text-lol-loss"}`}
          >
            {win ? "Victory" : "Defeat"} · {fmtClock(match.game_duration)}
          </div>
          <div className="font-display text-[20px] font-bold text-lol-text-bright">
            {match.kills} / <span className="text-lol-loss">{match.deaths}</span> / {match.assists}
            <span className="ml-3 text-[13px] font-semibold text-lol-win">
              {kdaRatio(match.kills, match.deaths, match.assists).toFixed(2)} KDA
            </span>
          </div>
        </div>
        {augments.length > 0 && (
          <div className="flex gap-1.5">
            {augments.map((id) => (
              <AugmentIcon key={id} augmentId={id} size={36} />
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {items.map((id, i) => (
            <span
              key={`${id}-${i}`}
              className="inline-flex rounded-md border border-lol-border/50 bg-black/30 p-px"
            >
              <ItemIcon itemId={id} size={30} />
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
        <Metric
          label="Damage dealt"
          value={formatNumber(match.total_damage_dealt)}
          tone="text-lol-crimson"
        />
        <Metric
          label="Damage taken"
          value={formatNumber(match.total_damage_taken)}
          tone="text-lol-assist"
        />
        <Metric
          label="Damage / min"
          value={formatNumber(Math.round(match.total_damage_dealt / minutes))}
          tone="text-lol-crimson"
        />
        <Metric label="Healed" value={formatNumber(match.total_heal)} tone="text-lol-win" />
        <Metric label="Gold earned" value={formatNumber(match.gold_earned)} tone="text-lol-gold" />
        <Metric
          label="CS"
          value={`${match.cs ?? 0} · ${((match.cs ?? 0) / minutes).toFixed(1)}/min`}
        />
        <Metric label="Score" value={match.score != null ? match.score.toFixed(1) : "—"} />
      </div>

      <div className="mt-4">
        <div className="mb-2 font-display text-[10px] font-bold uppercase tracking-widest text-lol-text">
          Your highest values this game
        </div>
        {peakBy.size === 0 ? (
          <p className="text-[12.5px] text-lol-text">
            Not recorded for this game. Stats are saved while a game is played with the app open.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            {PEAK_ROWS.filter((r) => peakBy.has(r.key)).map((r) => (
              <div
                key={r.key}
                className="flex items-center justify-between gap-3 border-b border-lol-border/25 py-1"
              >
                <span className="flex items-center gap-2 text-[12px] text-lol-text">
                  <StatIcon iconKey={r.key} label={r.label} />
                  {r.label}
                </span>
                <span className="flex items-baseline gap-2">
                  {(() => {
                    const rec = records.get(r.key);
                    if (!rec) return null;
                    // The record row is this very game, so it either is the record or ties it
                    return rec.gameId === match.game_id ? (
                      <span className="rounded bg-lol-gold px-1.5 text-[9.5px] font-bold uppercase tracking-wider text-[#241705]">
                        Record
                      </span>
                    ) : (
                      <span
                        className="text-[10.5px] text-lol-text/60"
                        title={`Your best on this champion, game ${rec.gameId}`}
                      >
                        best {formatPeak(rec.peak, r.fmt)}
                      </span>
                    );
                  })()}
                  <b className="font-display text-[13px] tabular-nums text-lol-text-bright">
                    {formatPeak(peakBy.get(r.key) ?? 0, r.fmt)}
                  </b>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
