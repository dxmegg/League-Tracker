import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { MatchListItem } from "../../../shared/api";
import { QUEUE_LABELS } from "../../../shared/queues";
import { formatNumber, formatTimeAgo } from "../../lib/format";
import { fmtClock, kdaRatio } from "../../lib/live";
import ChampionIcon from "../ChampionIcon";
import { Panel } from "../Panel";
import { Title } from "./shared";

const PAGE = 10;

// Finished games stored in the local database, newest first. Sits at the very bottom of the tab.
export function LiveSavedGames() {
  const [limit, setLimit] = useState(PAGE);
  const [matches, setMatches] = useState<MatchListItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      window.api
        .getHomeMatchList("all", undefined, limit)
        .then((p) => {
          if (!cancelled) setMatches(p.matches);
        })
        .catch(() => {});
    void load();
    const off = window.api.onGamesUpdated(() => void load());
    return () => {
      cancelled = true;
      off();
    };
  }, [limit]);

  return (
    <Panel variant="tile" accent="var(--color-lol-text)">
      <Title aside={<span className="text-[13px] text-lol-text">{matches.length} shown</span>}>
        Saved games
      </Title>
      {matches.length === 0 ? (
        <p className="text-[12.5px] text-lol-text">No finished games saved yet.</p>
      ) : (
        <div className="flex flex-col">
          {matches.map((m) => {
            const win = m.win === 1;
            return (
              <Link
                key={m.game_id}
                to={`/match/${m.game_id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-lol-border/25 py-2 transition-colors hover:bg-white/5"
              >
                <span
                  className={`w-[64px] font-display text-[13px] font-bold ${win ? "text-lol-win" : "text-lol-loss"}`}
                >
                  {win ? "Victory" : "Defeat"}
                </span>
                <ChampionIcon championId={m.champion_id} size={34} className="rounded-lg" />
                <span className="w-[110px] font-display text-[14px] font-bold tabular-nums text-lol-text-bright">
                  {m.kills} / <span className="text-lol-loss">{m.deaths}</span> / {m.assists}
                </span>
                <span className="w-[70px] text-[12px] tabular-nums text-lol-win">
                  {kdaRatio(m.kills, m.deaths, m.assists).toFixed(2)} KDA
                </span>
                <span className="w-[56px] text-[12px] tabular-nums text-lol-text">
                  {fmtClock(m.game_duration)}
                </span>
                <span className="w-[80px] text-[12px] tabular-nums text-lol-crimson">
                  {formatNumber(m.total_damage_dealt)} dmg
                </span>
                <span className="ml-auto text-[12px] text-lol-text">
                  {QUEUE_LABELS[m.queue_id] ?? `Queue ${m.queue_id}`} ·{" "}
                  {formatTimeAgo(m.game_creation)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
      {matches.length >= limit && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE)}
          className="mt-3 rounded-lg border border-lol-border/60 bg-lol-card/50 px-3 py-1.5 font-display text-[12px] font-semibold text-lol-text transition-colors hover:border-lol-crimson/40 hover:text-lol-text-bright"
        >
          Show more
        </button>
      )}
    </Panel>
  );
}
