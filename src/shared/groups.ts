// Which teammates keep showing up together. No imports, so a script can test this.

export interface TeammateGameRow {
  game_id: number;
  game_creation: number;
  key: string;
  name: string;
  win: number;
  kills: number;
  deaths: number;
  assists: number;
}

export interface TeammateGroup {
  id: string;
  names: string[];
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  lastPlayed: number;
  lastGameId: number;
}

// A teammate met this often is no longer a random one
const MIN_GAMES = 2;

// A group is the set of regulars on your team in one game; it counts once it repeats
export function groupTeammates(rows: TeammateGameRow[]): TeammateGroup[] {
  const met = new Map<string, number>();
  const games = new Map<number, TeammateGameRow[]>();
  for (const row of rows) {
    met.set(row.key, (met.get(row.key) ?? 0) + 1);
    games.set(row.game_id, [...(games.get(row.game_id) ?? []), row]);
  }

  const groups = new Map<string, TeammateGroup>();
  for (const team of games.values()) {
    const regulars = team
      .filter((r) => met.get(r.key)! >= MIN_GAMES)
      .sort((a, b) => a.key.localeCompare(b.key));
    if (regulars.length < 2) continue;
    const id = regulars.map((r) => r.key).join("|");
    const group = groups.get(id) ?? {
      id,
      names: [],
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      lastPlayed: 0,
      lastGameId: 0,
    };
    group.games++;
    group.wins += team[0].win;
    for (const r of regulars) {
      group.kills += r.kills;
      group.deaths += r.deaths;
      group.assists += r.assists;
    }
    if (team[0].game_creation > group.lastPlayed) {
      group.lastPlayed = team[0].game_creation;
      group.lastGameId = team[0].game_id;
      group.names = regulars.map((r) => r.name);
    }
    groups.set(id, group);
  }
  return [...groups.values()].filter((g) => g.games >= MIN_GAMES).sort((a, b) => b.games - a.games);
}
