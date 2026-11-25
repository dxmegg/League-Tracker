import { useEffect, useState } from "react";
import type { MatchListItem } from "../../../shared/api";
import { QUEUE_LABELS } from "../../../shared/queues";
import { formatNumber, formatTimeAgo } from "../../lib/format";
import { fmtClock, kdaRatio } from "../../lib/live";
import { PeakStats } from "./PeakStats";
import AugmentIcon from "../AugmentIcon";
import { parseAugmentIds } from "../AugmentGrid";
import ChampionIcon from "../ChampionIcon";
import ItemIcon from "../ItemIcon";
import { Panel } from "../Panel";
import { Title } from "./shared";

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
        <PeakStats gameId={match.game_id} championId={match.champion_id} />
      </div>
    </Panel>
  );
}
