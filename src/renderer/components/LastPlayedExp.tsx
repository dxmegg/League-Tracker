import ChampionIcon from "./ChampionIcon";
import { getChampionName } from "../hooks/useChampions";
import { kdaRatio } from "../lib/format";
import type { ChampionData, MatchListItem } from "../../shared/api";

interface LastPlayedRow {
  championId: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
}

export function LastPlayedExp({
  matches,
  loading,
  champData,
}: {
  matches: MatchListItem[];
  loading: boolean;
  champData: ChampionData;
}) {
  if (loading) {
    return <p className="text-sm text-lol-text">Loading…</p>;
  }

  const byChampion = new Map<number, MatchListItem[]>();
  for (const match of matches) {
    const games = byChampion.get(match.champion_id) ?? [];
    games.push(match);
    byChampion.set(match.champion_id, games);
  }

  const rows: LastPlayedRow[] = [...byChampion.entries()]
    .map(([championId, games]) => ({
      championId,
      wins: games.filter((game) => game.win).length,
      losses: games.filter((game) => !game.win).length,
      kills: games.reduce((sum, game) => sum + game.kills, 0),
      deaths: games.reduce((sum, game) => sum + game.deaths, 0),
      assists: games.reduce((sum, game) => sum + game.assists, 0),
      gameCount: games.length,
    }))
    .sort((left, right) => right.gameCount - left.gameCount || left.championId - right.championId)
    .slice(0, 10);

  if (rows.length === 0) {
    return <p className="text-sm text-lol-text">No games recorded</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1">
        {matches.slice(0, 5).map((match) => (
          <span
            key={match.game_id}
            className={`grid h-6 w-6 place-items-center rounded-md font-display text-[12px] font-bold ${
              match.win ? "bg-lol-win text-[#0b1a14]" : "bg-lol-loss text-[#2a0710]"
            }`}
          >
            {match.win ? "W" : "L"}
          </span>
        ))}
      </div>
      <div className="flex flex-col">
        {rows.map((row) => {
          const ratio = kdaRatio(row.kills, row.deaths, row.assists);
          return (
            <div
              key={row.championId}
              className="grid grid-cols-[30px_62px_1fr_auto] items-center gap-2.5 border-t border-lol-border/40 py-1.5 text-[13.5px]"
            >
              <span title={getChampionName(champData, row.championId)}>
                <ChampionIcon championId={row.championId} size={28} className="rounded-lg" />
              </span>
              <span className="whitespace-nowrap font-display text-[13.5px] font-semibold">
                <span className="text-lol-win">{row.wins}W</span> –{" "}
                <span className="text-lol-loss">{row.losses}L</span>
              </span>
              <span className="whitespace-nowrap text-right text-lol-text">
                {(row.kills / (row.wins + row.losses)).toFixed(1)} /{" "}
                {(row.deaths / (row.wins + row.losses)).toFixed(1)} /{" "}
                {(row.assists / (row.wins + row.losses)).toFixed(1)}
              </span>
              <b className="whitespace-nowrap font-display text-[13.5px] font-semibold text-lol-text-bright">
                {ratio} KDA
              </b>
            </div>
          );
        })}
      </div>
    </div>
  );
}
