// Achievement definitions. Each has one threshold per League tier, Iron to Challenger.
import type { AchievementTotals } from "../../shared/api";

export const TIERS = [
  { name: "Iron", color: "#8a807c", points: 5 },
  { name: "Bronze", color: "#b07a4f", points: 10 },
  { name: "Silver", color: "#a9bac6", points: 15 },
  { name: "Gold", color: "#e0b65c", points: 25 },
  { name: "Platinum", color: "#4fc3b8", points: 35 },
  { name: "Emerald", color: "#38c172", points: 50 },
  { name: "Diamond", color: "#6f8cff", points: 70 },
  { name: "Master", color: "#b86bff", points: 100 },
  { name: "Grandmaster", color: "#ef5262", points: 140 },
  { name: "Challenger", color: "#f6d77a", points: 200 },
] as const;

export type Achievement = {
  key: keyof AchievementTotals;
  category: "Career" | "Combat" | "Multikills" | "Economy & damage" | "Champions" | "Feats";
  name: string;
  description: string;
  // Ten ascending values, one per tier
  steps: number[];
};

const list = (
  category: Achievement["category"],
  entries: [Achievement["key"], string, string, number[]][],
): Achievement[] =>
  entries.map(([key, name, description, steps]) => ({
    key,
    category,
    name,
    description,
    steps,
  }));

const K = 1_000;
const M = 1_000_000;

export const ACHIEVEMENTS: Achievement[] = [
  ...list("Career", [
    ["games", "Regular", "Games played", [10, 50, 100, 250, 500, 1000, 1750, 2500, 4000, 6000]],
    ["wins", "Winner", "Games won", [5, 25, 50, 125, 250, 500, 900, 1400, 2200, 3500]],
    ["hours", "Time well spent", "Hours in game", [5, 20, 50, 100, 200, 350, 600, 900, 1400, 2000]],
    ["bestStreak", "On a roll", "Longest win streak", [2, 3, 4, 5, 7, 9, 11, 13, 16, 20]],
  ]),
  ...list("Combat", [
    [
      "kills",
      "Slayer",
      "Total kills",
      [100, 500, K, 2500, 5 * K, 10 * K, 18 * K, 28 * K, 40 * K, 60 * K],
    ],
    [
      "assists",
      "Team player",
      "Total assists",
      [200, K, 2500, 5 * K, 10 * K, 20 * K, 35 * K, 55 * K, 80 * K, 120 * K],
    ],
    [
      "deaths",
      "Cannon fodder",
      "Total deaths",
      [100, 500, K, 2500, 5 * K, 9 * K, 15 * K, 22 * K, 32 * K, 50 * K],
    ],
    ["bestKills", "Bloodbath", "Most kills in one game", [5, 10, 15, 20, 26, 32, 40, 50, 65, 80]],
    [
      "bestAssists",
      "Wingman",
      "Most assists in one game",
      [10, 15, 20, 25, 30, 36, 42, 50, 60, 75],
    ],
    ["bestSpree", "Unstoppable", "Longest killing spree", [3, 5, 7, 9, 11, 13, 16, 19, 23, 30]],
  ]),
  ...list("Multikills", [
    [
      "doubles",
      "Double trouble",
      "Double kills",
      [10, 100, 300, 750, 1500, 3 * K, 5 * K, 8 * K, 12 * K, 18 * K],
    ],
    ["triples", "Hat trick", "Triple kills", [3, 20, 75, 200, 500, K, 1750, 2750, 4 * K, 6 * K]],
    ["quadras", "Almost there", "Quadra kills", [1, 5, 20, 50, 125, 250, 450, 700, 1100, 1600]],
    ["pentas", "PENTAKILL", "Penta kills", [1, 3, 8, 20, 40, 75, 130, 200, 300, 450]],
  ]),
  ...list("Economy & damage", [
    [
      "damage",
      "Damage dealer",
      "Damage to champions",
      [M, 5 * M, 10 * M, 25 * M, 50 * M, 100 * M, 175 * M, 275 * M, 400 * M, 600 * M],
    ],
    [
      "damageTaken",
      "Frontline",
      "Damage taken",
      [M, 5 * M, 10 * M, 25 * M, 50 * M, 100 * M, 175 * M, 275 * M, 400 * M, 600 * M],
    ],
    [
      "healing",
      "Field medic",
      "Healing done",
      [100 * K, 500 * K, M, 5 * M, 10 * M, 20 * M, 35 * M, 55 * M, 80 * M, 120 * M],
    ],
    [
      "gold",
      "Treasurer",
      "Gold earned",
      [100 * K, 500 * K, M, 3 * M, 6 * M, 12 * M, 20 * M, 32 * M, 48 * M, 75 * M],
    ],
    [
      "cs",
      "Farmer",
      "Minions and monsters killed",
      [K, 5 * K, 10 * K, 25 * K, 50 * K, 100 * K, 175 * K, 275 * K, 400 * K, 600 * K],
    ],
    [
      "bestDamage",
      "One-man army",
      "Most damage in one game",
      [15 * K, 25 * K, 35 * K, 45 * K, 55 * K, 70 * K, 85 * K, 100 * K, 125 * K, 160 * K],
    ],
    [
      "bestCrit",
      "Big number",
      "Largest critical strike",
      [300, 500, 700, 900, 1200, 1500, 1900, 2400, 3 * K, 4 * K],
    ],
  ]),
  ...list("Champions", [
    [
      "champions",
      "Explorer",
      "Different champions played",
      [5, 15, 30, 50, 70, 90, 110, 130, 150, 170],
    ],
    [
      "championsWon",
      "Jack of all trades",
      "Champions you have won with",
      [3, 10, 25, 45, 65, 85, 105, 125, 145, 170],
    ],
    [
      "mainGames",
      "One-trick",
      "Games on your most played champion",
      [5, 15, 25, 50, 75, 100, 150, 250, 400, 700],
    ],
    [
      "masteredChampions",
      "Deep pool",
      "Champions with 10+ games",
      [1, 5, 10, 20, 35, 50, 70, 95, 125, 160],
    ],
  ]),
  ...list("Feats", [
    [
      "deathlessWins",
      "Untouchable",
      "Wins without dying",
      [1, 3, 10, 25, 50, 90, 140, 200, 300, 450],
    ],
    [
      "greatScores",
      "Standout",
      "Games scored 9.0 or higher",
      [1, 5, 15, 35, 70, 125, 200, 300, 450, 700],
    ],
    ["mvps", "Most valuable", "Games finished as MVP", [1, 5, 15, 40, 80, 150, 250, 400, 600, 900]],
    [
      "favorites",
      "Highlight reel",
      "Games marked as favorite",
      [1, 3, 5, 10, 20, 35, 50, 75, 100, 150],
    ],
  ]),
];

// Tier reached (-1 = none yet), progress toward the next one and the points earned
export function progressOf(achievement: Achievement, totals: AchievementTotals) {
  const value = Math.floor(totals[achievement.key] ?? 0);
  let tier = -1;
  while (tier + 1 < achievement.steps.length && value >= achievement.steps[tier + 1]) tier++;
  const next = achievement.steps[tier + 1];
  const previous = achievement.steps[tier] ?? 0;
  return {
    value,
    tier,
    next,
    fraction: next === undefined ? 1 : (value - previous) / (next - previous),
    points: TIERS.slice(0, tier + 1).reduce((sum, t) => sum + t.points, 0),
  };
}
