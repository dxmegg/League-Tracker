// Pure aggregations behind the item detail page; checked by scripts/check-item-stats.mjs

export type ItemGame = {
  game_id: number;
  champion_id: number;
  game_creation: number;
  game_duration: number;
  queue_id: number;
  win: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  taken: number;
  gold: number;
  heal: number;
  score: number | null;
};

export type Bucket = { label: string; games: number; wins: number };

function bucketBy(games: ItemGame[], label: (game: ItemGame) => string): Bucket[] {
  const buckets = new Map<string, Bucket>();
  for (const game of games) {
    const key = label(game);
    const bucket = buckets.get(key) ?? { label: key, games: 0, wins: 0 };
    bucket.games++;
    bucket.wins += game.win;
    buckets.set(key, bucket);
  }
  return [...buckets.values()];
}

const LENGTHS = ["Under 15 min", "15–20 min", "20–25 min", "25 min and more"];

export function byGameLength(games: ItemGame[]): Bucket[] {
  const label = (g: ItemGame) =>
    LENGTHS[Math.max(0, Math.min(3, Math.floor(g.game_duration / 300) - 2))];
  return bucketBy(games, label).sort((a, b) => LENGTHS.indexOf(a.label) - LENGTHS.indexOf(b.label));
}

export function byQueue(games: ItemGame[], name: (queueId: number) => string): Bucket[] {
  return bucketBy(games, (g) => name(g.queue_id)).sort((a, b) => b.games - a.games);
}

// Oldest month first, labelled YYYY-MM
export function byMonth(games: ItemGame[]): Bucket[] {
  const label = (g: ItemGame) => {
    const date = new Date(g.game_creation);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  };
  return bucketBy(games, label).sort((a, b) => a.label.localeCompare(b.label));
}

export type ChampionSplit = {
  champion_id: number;
  games: number;
  wins: number;
  championGames: number;
  championWins: number;
};

// Win rate points gained with the item; null when either side has too few games to compare
export function winRateBoost(row: ChampionSplit, minGames = 5): number | null {
  const without = row.championGames - row.games;
  if (row.games < minGames || without < minGames) return null;
  return (row.wins / row.games - (row.championWins - row.wins) / without) * 100;
}
