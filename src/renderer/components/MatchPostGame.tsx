import type { ReactNode } from "react";
import type { MatchTeamRecord, ParsedParticipant } from "../../shared/api";
import { formatNumber } from "../lib/format";
import { getChampionName, useChampionData } from "../hooks/useChampions";
import { Title } from "./live/shared";
import { Panel } from "./Panel";

type Data = Record<string, any>;

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-[200px] rounded-xl border border-lol-border/60 bg-black/25 px-4 py-2.5">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-lol-text">
        {title}
      </div>
      <div className="text-[13px] tabular-nums text-lol-text-bright">{children}</div>
    </div>
  );
}

// What the client only offers after a game: grades, mastery, honor, challenges
export function MatchPostGame({
  data,
  players,
}: {
  data: Record<string, unknown> | undefined;
  players: ParsedParticipant[];
}) {
  const champData = useChampionData();
  const post = (data ?? {}) as Data;
  const mastery = post.mastery_updates;
  const honor: Data[] = post.honor ?? [];
  const challenges: Data[] = post.challenge_changes ?? [];
  const counters: Data[] = post.counters ?? [];
  const statstones = Object.entries((post.statstones ?? {}) as Data).filter(
    ([, v]) => Array.isArray(v) && v.length > 0,
  );
  const name = (puuid: string) =>
    players.find((p) => p.puuid === puuid)?.summonerName ?? "Unknown player";
  if (Object.keys(post).length === 0) return null;

  return (
    <Panel variant="tile">
      <Title>After the game</Title>
      <div className="flex flex-wrap gap-2">
        {mastery && (
          <Block title="Grade and mastery">
            <div>Grade {mastery.grade || "—"}</div>
            <div>+{formatNumber(mastery.pointsGained ?? 0)} points</div>
            <div>Mastery level {mastery.level}</div>
            <div>Marks earned: {mastery.tokensEarned ?? 0}</div>
            <div>Points to next level: {mastery.pointsUntilNextLevelAfterGame}</div>
          </Block>
        )}
        {mastery?.memberGrades?.length > 0 && (
          <Block title="Team grades">
            {mastery.memberGrades.map((g: Data) => (
              <div key={g.puuid}>
                {name(g.puuid)} ({getChampionName(champData, g.championId)}): {g.grade}
              </div>
            ))}
          </Block>
        )}
        {(honor.length > 0 || post.honor_profile) && (
          <Block title="Honor">
            {post.honor_profile && <div>Honor level {post.honor_profile.honorLevel}</div>}
            {honor.map((h) => (
              <div key={h.puuid}>Honored by {name(h.puuid)}</div>
            ))}
          </Block>
        )}
        {challenges.length > 0 && (
          <Block title="Challenges">
            {challenges.map((c) => (
              <div key={c.id}>
                {c.name}: +{formatNumber(c.after - c.before)}
                {c.level !== c.levelBefore ? ` (now ${c.level})` : ""}
              </div>
            ))}
          </Block>
        )}
        {statstones.length > 0 && (
          <Block title="Statstones">
            {statstones.map(([key, value]) => (
              <div key={key}>
                {key}: {(value as unknown[]).length}
              </div>
            ))}
          </Block>
        )}
        {counters.length > 0 && (
          <Block title="Mayhem counters after the game">
            {counters.map((c) => (
              <div key={c.name}>
                {c.name.replace("KIWI ", "")}: {formatNumber(c.value)}
              </div>
            ))}
          </Block>
        )}
      </div>
    </Panel>
  );
}

const TEAM_ROWS: Array<[string, keyof MatchTeamRecord, boolean?]> = [
  ["Towers", "tower_kills"],
  ["Inhibitors", "inhibitor_kills"],
  ["Barons", "baron_kills"],
  ["Dragons", "dragon_kills"],
  ["Rift heralds", "rift_herald_kills"],
  ["Voidgrubs", "horde_kills"],
  ["Atakhan", "atakhan_kills"],
  ["First blood", "first_blood", true],
  ["First tower", "first_tower", true],
  ["First baron", "first_baron", true],
  ["First dragon", "first_dragon", true],
  ["First herald", "first_herald", true],
];

export function MatchTeams({ teams }: { teams: MatchTeamRecord[] | undefined }) {
  if (!teams?.length) return null;
  return (
    <div className="app-tile shrink-0 overflow-x-auto p-3">
      <table className="w-full text-[13px] tabular-nums">
        <thead>
          <tr className="text-lol-gold">
            <th className="px-3 text-left">Team</th>
            {TEAM_ROWS.map(([label]) => (
              <th key={label} className="px-2 text-center font-semibold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr key={team.team_id} className="text-lol-text-bright">
              <td className={`px-3 py-1 ${team.win ? "text-lol-win" : "text-lol-loss"}`}>
                {team.team_id === 100 ? "Blue" : team.team_id === 200 ? "Red" : team.team_id}
              </td>
              {TEAM_ROWS.map(([label, key, flag]) => (
                <td key={label} className="px-2 text-center">
                  {flag ? (team[key] ? "✓" : "—") : team[key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
