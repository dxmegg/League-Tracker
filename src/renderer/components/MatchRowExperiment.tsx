import type { ChampionData, MatchDetail, MatchListItem } from "../../shared/api";
import { isAugmentQueue } from "../../shared/queues";
import { queueLabel } from "./QueueSelect";
import { AugmentGrid, parseAugmentIds } from "./AugmentGrid";
import ChampionIcon from "./ChampionIcon";
import ItemIcon from "./ItemIcon";
import MatchScoreboardExp from "./MatchScoreboardExp";
import { RuneCompact } from "./RuneSetup";
import RuneIcon from "./RuneIcon";
import { useRuneData } from "../hooks/useChampions";
import { formatDuration, formatKDA, formatNumber, formatTimeAgo, kdaRatio } from "../lib/format";
import { parseRuneIds, splitRuneSelections } from "../lib/runes";

const STYLE = `
.match-list-exp {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.match-row {
  display: grid;
  align-items: center;
  gap: 8px 14px;
  padding: 12px 16px 12px 18px;
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  box-shadow: inset 3px 0 0 var(--edge);
  --edge: var(--theme-win);
  container-type: inline-size;
  grid-template-columns: 76px minmax(170px, 1.1fr) 106px 58px 62px 172px 138px minmax(0, 1fr) 68px;
  grid-template-areas: "res champ kda cs score bars items multi time";
  background: linear-gradient(90deg, var(--theme-surface) 0%, transparent 55%), var(--theme-card);
}
.match-row[data-win="false"] { --edge: var(--theme-loss); }
.match-row[data-win="true"] {
  background: linear-gradient(90deg, rgba(56,214,162,0.10) 0%, transparent 55%), var(--theme-card);
}
.match-row[data-win="false"] {
  background: linear-gradient(90deg, rgba(240,86,110,0.11) 0%, transparent 55%), var(--theme-card);
}
.match-row .m-res { grid-area: res; }
.match-row .m-res b { display: block; font-family: var(--theme-font-display); font-size: 19px; line-height: 1.1; font-weight: 700; }
.match-row .m-res span { color: var(--theme-foreground-muted); font-size: 12.5px; }
.match-row .m-champ { grid-area: champ; display: flex; align-items: center; gap: 12px; min-width: 0; }
.match-row .m-champ .champ-icon-wrap {
  width: 52px; height: 52px; border-radius: 9999px; overflow: hidden; flex: none;
  box-shadow: 0 0 0 2px var(--edge), 0 0 0 4px var(--theme-card);
}
.match-row .m-champ strong { display: block; font-family: var(--theme-font-display); font-size: 16px; line-height: 1.2; font-weight: 600; }
.match-row .m-kda { grid-area: kda; }
.match-row .m-kda b { display: block; white-space: nowrap; font-family: var(--theme-font-display); font-size: 15px; font-weight: 600; }
.match-row .m-kda span { font-size: 12.5px; color: var(--theme-foreground-muted); }
.match-row .m-kda span.hi { color: var(--theme-gold); }
.match-row .m-cs { grid-area: cs; font-family: var(--theme-font-display); font-size: 15px; font-weight: 600; }
.match-row .m-cs span { display: block; font-family: var(--theme-font-body); font-size: 12.5px; color: var(--theme-foreground-muted); }
.match-row .m-score { grid-area: score; text-align: center; }
.match-row .m-score b { display: block; font-family: var(--theme-font-display); font-size: 19px; line-height: 1.1; font-weight: 700; color: var(--theme-gold); }
.match-row .badge { display: inline-block; margin-top: 3px; font-family: var(--theme-font-display); font-size: 10.5px; line-height: 1; font-weight: 700; padding: 3px 7px; border-radius: 5px; letter-spacing: 0.4px; }
.match-row .badge.mvp { background: var(--theme-gold); color: #241705; }
.match-row .badge.ace { background: var(--theme-violet); color: #150c33; }
.match-row .m-bars { grid-area: bars; display: grid; gap: 5px; }
.match-row .bar { display: grid; grid-template-columns: 44px 1fr 44px; gap: 8px; align-items: center; font-size: 12px; color: var(--theme-foreground-muted); }
.match-row .bar .track { height: 4px; border-radius: 3px; background: rgba(255,255,255,0.05); overflow: hidden; }
.match-row .bar .track i { display: block; height: 100%; border-radius: 3px; }
.match-row .bar.d .track i { background: var(--theme-crimson); }
.match-row .bar.t .track i { background: var(--theme-assist); }
.match-row .bar.h .track i { background: var(--theme-win); }
.match-row .bar em { font-style: normal; text-align: right; font-variant-numeric: tabular-nums; }
.match-row .m-items { grid-area: items; display: flex; align-items: center; gap: 8px; min-width: 0; }
.match-row .m-items .itg { display: grid; grid-template-columns: repeat(3, 22px); gap: 3px; }
.match-row .m-multi { grid-area: multi; display: flex; flex-wrap: wrap; gap: 5px; min-width: 0; padding-left: 12px; }
.match-row .pill { font-family: var(--theme-font-display); font-size: 11.5px; line-height: 1; font-weight: 600; padding: 5px 10px; border-radius: 9999px; border: 1px solid; }
.match-row .pill.d { color: var(--theme-assist); border-color: rgba(77,184,255,0.5); background: rgba(77,184,255,0.10); }
.match-row .pill.t { color: var(--theme-gold); border-color: rgba(230,188,99,0.55); background: rgba(230,188,99,0.10); }
.match-row .pill.q { color: var(--theme-violet); border-color: rgba(169,139,255,0.55); background: rgba(169,139,255,0.10); }
.match-row .pill.p { color: var(--theme-loss); border-color: rgba(240,86,110,0.6); background: rgba(240,86,110,0.12); }
.match-row .m-time { grid-area: time; text-align: right; }
.match-row .m-time b { display: block; font-family: var(--theme-font-display); font-size: 14px; font-weight: 600; }
.match-row .m-time span { color: var(--theme-foreground-muted); font-size: 12.5px; }

@container (max-width: 1060px) {
  .match-row {
    grid-template-columns: 72px minmax(0, 1fr) auto auto;
    grid-template-areas:
      "res champ score time"
      "res kda cs cs"
      "res bars bars bars"
      "res items multi multi";
  }
  .match-row .m-score { text-align: right; }
}

@container (max-width: 560px) {
  .match-row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "res time"
      "champ score"
      "kda cs"
      "bars bars"
      "items items"
      "multi multi";
  }
  .match-row .m-cs { text-align: right; }
}
`;

export function MatchRowExperiment({
  match,
  championName,
  champData,
  expanded = false,
  detail = null,
  detailLoading = false,
  puuids = null,
  onToggle,
  onPlayerClick,
}: {
  match: MatchListItem;
  championName: string;
  champData?: ChampionData;
  expanded?: boolean;
  detail?: MatchDetail | null;
  detailLoading?: boolean;
  puuids?: string[] | null;
  onToggle?: () => void;
  onPlayerClick?: (player: {
    puuid: string | null;
    gameName: string | null;
    tagLine: string | null;
  }) => void;
}) {
  const isWin = !!match.win;
  const isRemake = !!match.is_remake;
  const runeData = useRuneData();
  const augmentIds = parseAugmentIds(match.augment_ids);
  const runeIds = parseRuneIds(match.rune_ids);
  const statShardIds = parseRuneIds(match.stat_shard_ids);
  const runeSetup = splitRuneSelections(runeIds, match.primary_style, match.secondary_style);
  const secondaryLabel = isAugmentQueue(match.queue_id)
    ? "Augments unavailable"
    : "Runes unavailable";

  return (
    <div>
      <style>{STYLE}</style>
      <article
        className={`match-row${onToggle ? " cursor-pointer" : ""}`}
        data-win={isWin}
        {...(onToggle ? { onClick: onToggle } : {})}
      >
        <div className="m-res">
          <b className={isWin ? "text-lol-win" : "text-lol-loss"}>
            {isRemake ? "RMK" : isWin ? "Win" : "Loss"}
          </b>
          <span>{queueLabel(match.queue_id)}</span>
        </div>

        <div className="m-champ">
          <div className="champ-icon-wrap">
            <ChampionIcon
              championId={match.champion_id}
              size={52}
              className="h-full w-full rounded-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <strong>{championName}</strong>
          </div>
        </div>

        <div className="m-kda">
          <b>{formatKDA(match.kills, match.deaths, match.assists)}</b>
          <span
            className={
              parseFloat(kdaRatio(match.kills, match.deaths, match.assists)) >= 4 ? "hi" : ""
            }
          >
            {kdaRatio(match.kills, match.deaths, match.assists)} KDA
          </span>
        </div>

        <div className="m-cs">
          {match.cs ?? 0}
          {!isRemake && match.game_duration > 0 && (
            <span>{((match.cs ?? 0) / (match.game_duration / 60)).toFixed(1)}/min</span>
          )}
        </div>

        <div className="m-score">
          {match.score != null ? (
            <>
              <b>{match.score.toFixed(1)}</b>
              {match.score_badge === "MVP" && <span className="badge mvp">MVP</span>}
              {match.score_badge === "ACE" && <span className="badge ace">ACE</span>}
            </>
          ) : (
            <div />
          )}
        </div>

        <div className="m-bars">
          {[
            ["Damage", match.total_damage_dealt, match.game_max_dmg, "d"],
            ["Taken", match.total_damage_taken, match.game_max_taken, "t"],
            ["Healed", match.total_heal, match.game_max_heal, "h"],
          ].map(([label, value, max, cls]) => {
            const v = value as number;
            const m = max as number;
            const pct = m > 0 ? Math.min(100, (v / m) * 100) : 0;
            return (
              <div key={label as string} className={`bar ${cls}`}>
                <span>{label}</span>
                <div className="track">
                  <i style={{ width: `${pct}%` }} />
                </div>
                <em>{v > 0 ? formatNumber(v) : ""}</em>
              </div>
            );
          })}
        </div>

        <div className="m-items" title={secondaryLabel}>
          <div className="flex items-center justify-center shrink-0">
            {isAugmentQueue(match.queue_id) ? (
              <AugmentGrid augmentIds={augmentIds} patch={match.game_version} />
            ) : (
              <RuneCompact
                runeIds={runeIds}
                primaryStyle={match.primary_style}
                secondaryStyle={match.secondary_style}
                statShardIds={statShardIds}
                runeData={runeData}
                version={match.game_version}
              >
                <span className="flex items-center gap-1 p-1 rounded-lg border border-lol-gold/40 bg-white/[0.02]">
                  <RuneIcon
                    runeId={runeSetup.keystone}
                    path={runeData[runeSetup.keystone ?? 0]?.icon}
                    version={match.game_version}
                    size={22}
                  />
                  <RuneIcon
                    runeId={match.secondary_style}
                    path={runeData[match.secondary_style ?? 0]?.icon}
                    version={match.game_version}
                    size={18}
                  />
                </span>
              </RuneCompact>
            )}
          </div>
          <span className="text-lol-text/40 text-xs select-none">+</span>
          <div className="itg">
            {[match.item0, match.item1, match.item2, match.item3, match.item4, match.item5].map(
              (id, i) => (
                <ItemIcon key={i} itemId={id ?? 0} size={22} patch={match.game_version} />
              ),
            )}
          </div>
        </div>

        <div className="m-multi">
          {match.double_kills > 0 && <span className="pill d">Double ×{match.double_kills}</span>}
          {match.triple_kills > 0 && <span className="pill t">Triple ×{match.triple_kills}</span>}
          {match.quadra_kills > 0 && <span className="pill q">Quadra ×{match.quadra_kills}</span>}
          {match.penta_kills > 0 && <span className="pill p">Penta ×{match.penta_kills}</span>}
        </div>

        <div className="m-time">
          <b>{formatDuration(match.game_duration)}</b>
          <span>{formatTimeAgo(match.game_creation)}</span>
        </div>
      </article>

      {expanded && (
        <div className="mb-2 rounded-b-xl border border-t-0 border-lol-border/60 bg-lol-card p-3">
          {detailLoading ? (
            <div className="py-4 text-center text-sm text-lol-text">Loading...</div>
          ) : detail ? (
            <MatchScoreboardExp
              detail={detail}
              champData={champData ?? {}}
              puuids={puuids ?? null}
              onPlayerClick={onPlayerClick}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
