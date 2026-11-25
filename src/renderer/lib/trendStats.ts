// Pure aggregations behind the Trends page; checked by scripts/check-trend-stats.mjs

export type TimelineGame = {
  owner: string;
  time: number;
  duration: number;
  win: number;
};

export type Split = { label: string; games: number; wins: number };

// A break longer than this starts a new sitting, as the recent sessions list does
const SESSION_GAP_MS = 2 * 60 * 60 * 1000;
const SESSION_SLOTS = ["1st game", "2nd game", "3rd game", "4th–5th game", "6th and later"];
const LENGTHS = ["Under 15 min", "15–20 min", "20–25 min", "25+ min"];

const empty = (labels: string[]): Split[] => labels.map((label) => ({ label, games: 0, wins: 0 }));

function add(split: Split, win: number) {
  split.games++;
  split.wins += win;
}

// Each account's games in the order they were played
function perOwner(games: TimelineGame[]): TimelineGame[][] {
  const owners = new Map<string, TimelineGame[]>();
  for (const game of games) {
    const list = owners.get(game.owner) ?? [];
    list.push(game);
    owners.set(game.owner, list);
  }
  return [...owners.values()].map((list) => list.sort((a, b) => a.time - b.time));
}

export function sessionEffects(games: TimelineGame[]) {
  const slots = empty(SESSION_SLOTS);
  const after = empty(["After a win", "After a loss"]);
  for (const list of perOwner(games)) {
    let position = 0;
    let previous: TimelineGame | null = null;
    for (const game of list) {
      const sameSitting = previous != null && game.time - previous.time <= SESSION_GAP_MS;
      position = sameSitting ? position + 1 : 1;
      add(slots[position <= 3 ? position - 1 : position <= 5 ? 3 : 4], game.win);
      // Only within a sitting: yesterday's loss is not what tilts today's game
      if (sameSitting) add(after[previous!.win ? 0 : 1], game.win);
      previous = game;
    }
  }
  return { slots, after };
}

export function byLength(games: TimelineGame[]): Split[] {
  const splits = empty(LENGTHS);
  for (const game of games) {
    add(splits[Math.max(0, Math.min(3, Math.floor(game.duration / 300) - 2))], game.win);
  }
  return splits;
}

// The group that sits furthest from the average on each side, ignoring thin samples
export function standouts(splits: Split[], average: number, minGames: number) {
  const rated = splits
    .filter((s) => s.games >= minGames)
    .map((s) => ({ ...s, delta: (s.wins / s.games) * 100 - average }))
    .sort((a, b) => b.delta - a.delta);
  return {
    best: rated.length && rated[0].delta > 0 ? rated[0] : null,
    worst: rated.length && rated[rated.length - 1].delta < 0 ? rated[rated.length - 1] : null,
  };
}

// Win rate of the last `size` games after every game; starts once there are that many
export function rollingWinRate(games: TimelineGame[], size: number) {
  const ordered = [...games].sort((a, b) => a.time - b.time);
  const points: { time: number; rate: number }[] = [];
  let wins = 0;
  ordered.forEach((game, index) => {
    wins += game.win;
    if (index >= size) wins -= ordered[index - size].win;
    if (index >= size - 1) points.push({ time: game.time, rate: (wins / size) * 100 });
  });
  return points;
}
