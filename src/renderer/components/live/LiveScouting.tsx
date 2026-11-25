import { useEffect, useMemo, useState } from "react";
import type {
  ChampionAllyRow,
  ChampionMatchupRow,
  LivePlayer,
  TeammateStats,
} from "../../../shared/api";
import { getChampionName } from "../../hooks/useChampions";
import { formatTimeAgo } from "../../lib/format";
import { Panel } from "../Panel";
import { SIDE, Title, Who, useLiveResolvers } from "./shared";

type Relation = "friends" | "enemies";

const pct = (wins: number, games: number) => (games > 0 ? Math.round((wins / games) * 100) : 0);
const wrTone = (rate: number) => (rate >= 50 ? "text-lol-win" : "text-lol-loss");

// What the local match history knows about the people in this game: have you met them before, and how
// did your games against (or with) their champion go. Nothing here leaves the computer.
export function LiveScouting({ players, allyTeam }: { players: LivePlayer[]; allyTeam: string }) {
  const { champData, championId } = useLiveResolvers();
  const me = players.find((p) => p.isMe);
  const myChampionId = me ? championId(me) : null;

  const [friends, setFriends] = useState<TeammateStats[]>([]);
  const [enemies, setEnemies] = useState<TeammateStats[]>([]);
  const [matchups, setMatchups] = useState<ChampionMatchupRow[]>([]);
  const [allies, setAllies] = useState<ChampionAllyRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      window.api.getTeammateStats(undefined, "friends").catch(() => []),
      window.api.getTeammateStats(undefined, "enemies").catch(() => []),
    ]).then(([f, e]) => {
      if (cancelled) return;
      setFriends(f as TeammateStats[]);
      setEnemies(e as TeammateStats[]);
    });
    return () => {
      cancelled = true;
    };
    // The roster of a running game does not change, so this is read once per game
  }, [me?.riotId]);

  useEffect(() => {
    if (myChampionId == null) return;
    let cancelled = false;
    Promise.all([
      window.api.getChampionMatchupList(myChampionId).catch(() => []),
      window.api.getChampionAllyStats(myChampionId).catch(() => []),
    ]).then(([m, a]) => {
      if (cancelled) return;
      setMatchups(m as ChampionMatchupRow[]);
      setAllies(a as ChampionAllyRow[]);
    });
    return () => {
      cancelled = true;
    };
  }, [myChampionId]);

  const lookup = (list: TeammateStats[], p: LivePlayer) =>
    list.find(
      (t) => (p.puuid && t.puuid === p.puuid) || t.name.toLowerCase() === p.gameName.toLowerCase(),
    );

  const matchupBy = useMemo(() => new Map(matchups.map((m) => [m.championId, m])), [matchups]);
  const allyBy = useMemo(() => new Map(allies.map((a) => [a.championId, a])), [allies]);

  const row = (p: LivePlayer) => {
    const isAlly = p.team === allyTeam;
    const same = lookup(isAlly ? friends : enemies, p);
    const other = lookup(isAlly ? enemies : friends, p);
    const champId = championId(p);
    const versus =
      champId != null ? (isAlly ? allyBy.get(champId) : matchupBy.get(champId)) : undefined;
    const champName = champId != null ? getChampionName(champData, champId) : p.championName;

    return (
      <div
        key={p.riotId || p.summonerName}
        className="grid grid-cols-[minmax(150px,1fr)_minmax(0,1.5fr)_minmax(0,1.3fr)] items-center gap-x-4 gap-y-1 rounded-xl border border-lol-border/60 bg-black/25 px-3.5 py-2.5"
      >
        <Who player={p} fallback={p.championName} ally={isAlly} size={30} />

        <div className="text-[12.5px] leading-snug text-lol-text">
          {same ? (
            <>
              {isAlly ? "Teamed" : "Faced"} <b className="text-lol-text-bright">{same.games}×</b>
              {" · "}
              <b className={wrTone(pct(same.wins, same.games))}>
                {pct(same.wins, same.games)}%
              </b>{" "}
              your win rate
              <span className="text-lol-text/60">
                {" · "}last {formatTimeAgo(same.lastPlayed)}
              </span>
            </>
          ) : (
            <span className="text-lol-text/70">First meeting</span>
          )}
          {other && (
            <div className="text-[11.5px] text-lol-text/70">
              Also {isAlly ? "faced" : "teamed"} {other.games}×
            </div>
          )}
        </div>

        <div className="text-[12.5px] leading-snug text-lol-text">
          {versus && versus.games > 0 ? (
            <>
              {isAlly ? "With" : "Against"} {champName}:{" "}
              <b className="text-lol-text-bright">{versus.games}</b>{" "}
              {versus.games === 1 ? "game" : "games"} ·{" "}
              <b className={wrTone(pct(versus.wins, versus.games))}>
                {pct(versus.wins, versus.games)}%
              </b>
            </>
          ) : (
            <span className="text-lol-text/70">
              {isAlly ? "Never teamed with" : "Never faced"} {champName} on this champion
            </span>
          )}
        </div>
      </div>
    );
  };

  const others = players.filter((p) => !p.isMe);
  const enemyRows = others.filter((p) => p.team !== allyTeam);
  const allyRows = others.filter((p) => p.team === allyTeam);

  return (
    <Panel variant="tile">
      <Title aside={<span className="text-[13px] text-lol-text">From your match history</span>}>
        Scouting
      </Title>
      <p className="mb-3 text-[12.5px] text-lol-text">
        Whether you have played with or against each of them before, and how{" "}
        {myChampionId != null ? getChampionName(champData, myChampionId) : "your champion"} has done
        against or alongside their champion.
      </p>
      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
        <div>
          <div
            className={`mb-2 font-display text-[11px] font-bold uppercase tracking-widest ${SIDE.enemy.text}`}
          >
            Enemies
          </div>
          <div className="flex flex-col gap-2">{enemyRows.map(row)}</div>
        </div>
        <div>
          <div
            className={`mb-2 font-display text-[11px] font-bold uppercase tracking-widest ${SIDE.ally.text}`}
          >
            Your team
          </div>
          <div className="flex flex-col gap-2">{allyRows.map(row)}</div>
        </div>
      </div>
    </Panel>
  );
}
