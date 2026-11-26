import { db } from "../../db";
import { getVisiblePuuids } from "../summoner";
import { cachedQuery } from "../cache";
import { computeMatchScores } from "../../../shared/opScore";
import { groupTeammates, type TeammateGroup } from "../../../shared/groups";
import type { TeammateChampionStats } from "../../../shared/api";
import { getChampionClasses } from "../../dragon";
import { applyQueueFilter, EXCLUDED_STATS_SQL, GAME_MAX_STATS_SQL } from "../filters";
import { displayName } from "../payloads";
import { groupByGame, scoreInputsFromRows, SCORE_ROW_COLUMNS, type ScoreRow } from "../scoring";

// The id the Friends list keys a teammate on — puuid when we know it, so name
// changes don't split a player in two.
export function teammateKey(puuid: string | null, name: string): string {
  return puuid || name;
}

export function teammateName(
  gameName: string | null,
  tagLine: string | null,
  participantId: number,
) {
  return displayName(gameName, tagLine) ?? `Player ${participantId}`;
}

interface TeammateRow {
  game_id: number;
  game_creation: number;
  participant_id: number;
  puuid: string | null;
  game_name: string | null;
  tag_line: string | null;
  profile_icon: number | null;
  champion_id: number;
  win: number;
  kills: number;
  deaths: number;
  assists: number;
  total_games: number;
}

// Every participant who shared a team with one of our accounts, one row per
// player per game.
//
// Which (game, team) pairs are ours is resolved up front in a CTE rather than
// as an EXISTS against each candidate row: the CTE is a single indexed lookup
// per account, where the correlated form made SQLite build a throwaway index
// on every call — 2.8 ms against 46 ms on a 580-game library, and it doesn't
// swing on whether ANALYZE has ever run. DISTINCT is what keeps the row count
// honest when two of our own accounts played the same game on the same side.
export function teammateRows(
  puuids: string[],
  queue?: number,
  relation: "friends" | "enemies" = "friends",
): TeammateRow[] {
  const ours = puuids.map(() => "?").join(", ");
  const where = [
    "o.is_remake = 0",
    `(o.puuid IS NULL OR o.puuid NOT IN (${ours}))`,
    // Hidden accounts are still you, so they never show up as a friend or a foe
    "(o.puuid IS NULL OR o.puuid NOT IN (SELECT puuid FROM summoner))",
  ];
  const params: any[] = [...puuids];
  applyQueueFilter(where, params, queue, "o");
  where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`);

  return db
    .prepare(`
      WITH our_teams AS (
        SELECT DISTINCT game_id, team_id FROM match_participants WHERE puuid IN (${ours})
      ),
      scoped_rows AS (
        SELECT o.game_id, g.game_creation, o.participant_id, o.puuid, o.game_name, o.tag_line,
               o.profile_icon, o.champion_id, o.win, o.kills, o.deaths, o.assists
        FROM our_teams t
        JOIN match_participants o ON o.game_id = t.game_id
        JOIN games g ON g.game_id = o.game_id
        WHERE ${where.join(" AND ")}
          AND ${relation === "enemies" ? "o.team_id != t.team_id" : "o.team_id = t.team_id"}
      )
      SELECT scoped_rows.*,
             (SELECT COUNT(DISTINCT game_id) FROM scoped_rows) AS total_games
      FROM scoped_rows
      ORDER BY scoped_rows.game_creation DESC
    `)
    .all(...puuids, ...params) as TeammateRow[];
}

export function getTeammateStats(
  queue?: number,
  relation: "friends" | "enemies" = "friends",
): any[] {
  return cachedQuery("getTeammateStats", [queue, relation], 60_000, () => {
    const puuids = getVisiblePuuids();
    if (puuids.length === 0) return [];

    const playerMap = new Map<
      string,
      {
        name: string;
        puuid: string | null;
        profileIcon: number | null;
        games: number;
        wins: number;
        kills: number;
        deaths: number;
        assists: number;
        champions: Map<number, number>;
        lastPlayed: number;
      }
    >();

    const rows = teammateRows(puuids, queue, relation);
    const totalGames = rows[0]?.total_games ?? 0;
    for (const row of rows) {
      const name = teammateName(row.game_name, row.tag_line, row.participant_id);
      const key = teammateKey(row.puuid, name);

      // If we now have a puuid but previously tracked this player by name, merge
      if (row.puuid && !playerMap.has(row.puuid) && playerMap.has(name)) {
        const old = playerMap.get(name)!;
        if (!old.puuid) {
          playerMap.set(row.puuid, old);
          old.puuid = row.puuid;
          playerMap.delete(name);
        }
      }

      if (!playerMap.has(key)) {
        playerMap.set(key, {
          name,
          puuid: row.puuid,
          profileIcon: null,
          games: 0,
          wins: 0,
          kills: 0,
          deaths: 0,
          assists: 0,
          champions: new Map(),
          lastPlayed: 0,
        });
      }

      const entry = playerMap.get(key)!;
      // Update name and icon to the most recent version
      if (row.game_creation > entry.lastPlayed) {
        entry.name = name;
        if (row.profile_icon != null) entry.profileIcon = row.profile_icon;
      }
      entry.games++;
      if (row.win) entry.wins++;
      entry.kills += row.kills;
      entry.deaths += row.deaths;
      entry.assists += row.assists;
      entry.lastPlayed = Math.max(entry.lastPlayed, row.game_creation);
      entry.champions.set(row.champion_id, (entry.champions.get(row.champion_id) || 0) + 1);
    }

    return Array.from(playerMap.entries())
      .filter(([, p]) => p.games >= 1)
      .map(([key, p]) => ({
        key,
        name: p.name,
        puuid: p.puuid,
        profileIcon: p.profileIcon,
        games: p.games,
        wins: p.wins,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        // Champion id breaks ties so the same five champions come back in the
        // same order every time, rather than in whatever order the rows arrived.
        champions: Array.from(p.champions.entries())
          .sort((a, b) => b[1] - a[1] || a[0] - b[0])
          .slice(0, 5)
          .map(([champion_id, games]) => ({ champion_id, games })),
        lastPlayed: p.lastPlayed,
        totalGames,
      }))
      .sort((a, b) => b.games - a.games);
  });
}

export function getTeammateGroups(queue?: number): TeammateGroup[] {
  return cachedQuery("getTeammateGroups", [queue], 60_000, () => {
    const puuids = getVisiblePuuids();
    if (puuids.length === 0) return [];
    return groupTeammates(
      teammateRows(puuids, queue).map((row) => {
        const name = teammateName(row.game_name, row.tag_line, row.participant_id);
        return { ...row, name, key: teammateKey(row.puuid, name) };
      }),
    );
  });
}

export function getTeammateChampions(
  queue?: number,
  relation: "friends" | "enemies" = "friends",
): TeammateChampionStats[] {
  return cachedQuery("getTeammateChampions", [queue, relation], 60_000, () => {
    const puuids = getVisiblePuuids();
    if (puuids.length === 0) {
      console.warn("[db] getTeammateChampions empty:", { reason: "no owned accounts" });
      return [];
    }

    const ours = puuids.map(() => "?").join(", ");
    const where = ["o.is_remake = 0", `(o.puuid IS NULL OR o.puuid NOT IN (${ours}))`];
    const params: any[] = [...puuids];
    applyQueueFilter(where, params, queue, "o");
    where.push(`g.queue_id NOT IN (${EXCLUDED_STATS_SQL})`, "o.champion_id > 0");

    return db
      .prepare(`
        WITH our_teams AS (
          SELECT DISTINCT game_id, team_id
          FROM match_participants
          WHERE puuid IN (${ours})
        ),
        scoped_rows AS (
          SELECT o.game_id, o.champion_id, o.win, o.kills, o.deaths, o.assists
          FROM our_teams t
          JOIN match_participants o ON o.game_id = t.game_id
          JOIN games g ON g.game_id = o.game_id
          WHERE ${where.join(" AND ")}
            AND ${relation === "enemies" ? "o.team_id != t.team_id" : "o.team_id = t.team_id"}
        )
        SELECT champion_id,
               COUNT(DISTINCT game_id) AS games,
               SUM(CASE WHEN win = 1 THEN 1 ELSE 0 END) AS wins,
               SUM(kills) AS kills,
               SUM(deaths) AS deaths,
               SUM(assists) AS assists,
               AVG((kills + assists) * 1.0 / MAX(deaths, 1)) AS kda,
               (SELECT COUNT(DISTINCT game_id) FROM scoped_rows) AS totalGames
        FROM scoped_rows
        GROUP BY champion_id
        ORDER BY games DESC, champion_id ASC
      `)
      .all(...puuids, ...params) as TeammateChampionStats[];
  });
}

// Every game we played alongside one teammate, from both sides: our stored
// stats for the row plus the teammate's own line in that game.
export function getTeammateDetail(
  key: string,
  queue?: number,
  relation: "friends" | "enemies" = "friends",
): { player: any; matches: any[] } | null {
  return cachedQuery("getTeammateDetail", [key, queue, relation], 30_000, () => {
    const puuids = getVisiblePuuids();
    if (puuids.length === 0) return null;

    // Rows are newest-first, so the first hit carries the current name and icon.
    // Older games can be missing puuids; once we know who we're looking at, match
    // those on name too — the same merge the Friends list does.
    const theirs: TeammateRow[] = [];
    let name: string | null = null;
    for (const row of teammateRows(puuids, queue, relation)) {
      const rowName = teammateName(row.game_name, row.tag_line, row.participant_id);
      if (teammateKey(row.puuid, rowName) === key) {
        name ??= rowName;
        theirs.push(row);
      } else if (name != null && row.puuid == null && rowName === name) {
        theirs.push(row);
      }
    }
    if (theirs.length === 0) return null;

    const byGame = new Map(theirs.map((row) => [row.game_id, row]));
    const gameIds = Array.from(byGame.keys());
    const idList = gameIds.map(() => "?").join(", ");

    // Our own row for each shared game — the same columns the match list shows.
    const ourMatches = db
      .prepare(`
      SELECT g.game_id, g.queue_id, g.game_creation, g.game_duration, g.is_remake, g.favorite,
             g.puuid, g.game_version,
             ps.champion_id, ps.win, ps.kills, ps.deaths, ps.assists,
             ps.double_kills, ps.triple_kills, ps.quadra_kills, ps.penta_kills,
             ps.total_damage_dealt, ps.total_damage_taken, ps.total_heal, ps.gold_earned,
             ps.score, ps.score_badge, ps.spell1, ps.spell2, ps.cs,
             ps.item0, ps.item1, ps.item2, ps.item3, ps.item4, ps.item5, ps.item6,
             (SELECT GROUP_CONCAT(augment_id, ',')
              FROM (SELECT augment_id FROM game_augments
                    WHERE game_id = g.game_id
                    ORDER BY slot)) as augment_ids,
${GAME_MAX_STATS_SQL}
      FROM games g
      JOIN player_stats ps ON g.game_id = ps.game_id
      WHERE g.game_id IN (${idList})
      ORDER BY g.game_creation DESC
    `)
      .all(...gameIds) as any[];

    // The teammate's score has to be computed rather than looked up — player_stats
    // only ever scores our own row — so each shared game needs all ten players.
    const scoreRows = groupByGame(
      db
        .prepare(
          `SELECT game_id, ${SCORE_ROW_COLUMNS}, cs FROM match_participants WHERE game_id IN (${idList})`,
        )
        .all(...gameIds) as (ScoreRow & { game_id: number; cs: number })[],
    );

    interface ChampionTotals {
      games: number;
      wins: number;
      kills: number;
      deaths: number;
      assists: number;
    }

    const matches: any[] = [];
    const champions = new Map<number, ChampionTotals>();
    const first = theirs[0];
    const player = {
      key,
      name: name ?? key,
      puuid: first.puuid,
      profileIcon: first.profile_icon,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      champions: [] as ({ champion_id: number } & ChampionTotals)[],
      lastPlayed: first.game_creation,
    };

    for (const row of ourMatches) {
      const friend = byGame.get(row.game_id);
      if (!friend) continue;

      if (player.profileIcon == null) player.profileIcon = friend.profile_icon;

      player.games++;
      if (friend.win) player.wins++;
      player.kills += friend.kills;
      player.deaths += friend.deaths;
      player.assists += friend.assists;

      if (!champions.has(friend.champion_id)) {
        champions.set(friend.champion_id, { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 });
      }
      const champ = champions.get(friend.champion_id)!;
      champ.games++;
      if (friend.win) champ.wins++;
      champ.kills += friend.kills;
      champ.deaths += friend.deaths;
      champ.assists += friend.assists;

      const gameRows = scoreRows.get(row.game_id) ?? [];
      const friendScore = computeMatchScores(
        scoreInputsFromRows(gameRows),
        getChampionClasses(),
      ).get(friend.participant_id);
      const friendStats = gameRows.find((p) => p.participant_id === friend.participant_id);

      const base = {
        ...row,
        friend: {
          champion_id: friend.champion_id,
          win: friend.win,
          kills: friend.kills,
          deaths: friend.deaths,
          assists: friend.assists,
          total_damage_dealt: friendStats?.total_damage_dealt ?? 0,
          total_damage_taken: friendStats?.total_damage_taken ?? 0,
          total_heal: friendStats?.total_heal ?? 0,
          score: friendScore?.score ?? null,
          score_badge: friendScore?.badge ?? null,
        },
      };
      if (relation === "enemies") {
        const enemy = base.friend;
        base.friend = {
          champion_id: row.champion_id,
          win: row.win,
          kills: row.kills,
          deaths: row.deaths,
          assists: row.assists,
          total_damage_dealt: row.total_damage_dealt,
          total_damage_taken: row.total_damage_taken,
          total_heal: row.total_heal,
          score: row.score,
          score_badge: row.score_badge,
        };
        base.champion_id = enemy.champion_id;
        base.cs = (friendStats as { cs?: number } | undefined)?.cs;
        base.win = enemy.win;
        base.kills = enemy.kills;
        base.deaths = enemy.deaths;
        base.assists = enemy.assists;
        base.total_damage_dealt = enemy.total_damage_dealt;
        base.total_damage_taken = enemy.total_damage_taken;
        base.total_heal = enemy.total_heal;
        base.score = enemy.score;
        base.score_badge = enemy.score_badge;
      }
      matches.push(base);
    }

    if (player.games === 0) return null;
    player.champions = Array.from(champions.entries())
      .map(([champion_id, totals]) => ({ champion_id, ...totals }))
      .sort((a, b) => b.games - a.games);

    return { player, matches };
  });
}
