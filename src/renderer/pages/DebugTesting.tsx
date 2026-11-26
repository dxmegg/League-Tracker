import { useState } from "react";
import type { ReactNode } from "react";
import ChampionIcon from "../components/ChampionIcon";
import { LastPlayed } from "../components/LastPlayed";
import { Panel } from "../components/Panel";
import SummonerIcon from "../components/SummonerIcon";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useChampionData } from "../hooks/useChampions";
import { useMatches } from "../hooks/useMatches";
import { useScopedQueue } from "../lib/historyScope";

// Test-only redesign of Your profile, drawn from template data. Only the last-played panel at the
// bottom reads real games.

const CHAMPS: Record<number, string> = {
  103: "Ahri",
  222: "Jinx",
  99: "Lux",
  157: "Yasuo",
  412: "Thresh",
  81: "Ezreal",
  145: "Kai'Sa",
  238: "Zed",
};

const PROFILE = {
  name: "Template",
  tag: "EUW",
  icon: 4568,
  level: 487,
  region: "EUW",
  streak: 4,
  solo: { tier: "Emerald", division: "II", lp: 64, wins: 112, losses: 98, color: "#2dd4a3" },
  flex: { tier: "Platinum", division: "I", lp: 22, wins: 41, losses: 37, color: "#4fb3c8" },
};

const SUMMARY = {
  games: 1248,
  wins: 676,
  kills: 8.4,
  deaths: 5.1,
  assists: 11.7,
  kp: 58,
  dmgShare: 27,
  csMin: 6.8,
  gold: 12840,
  length: "28:41",
  score: 6.42,
  teamScore: 5.31,
  mvp: 214,
  ace: 97,
  best: 9.81,
  worst: 1.12,
};

const MULTIKILLS = [
  { label: "Double", count: 742 },
  { label: "Triple", count: 168 },
  { label: "Quadra", count: 31 },
  { label: "Penta", count: 6 },
];

const MASTERY = [
  { id: 103, level: 47, points: 612_400 },
  { id: 222, level: 31, points: 402_150 },
  { id: 99, level: 22, points: 288_900 },
  { id: 157, level: 15, points: 190_330 },
  { id: 412, level: 11, points: 141_020 },
];

// Win rate over the last 20 weeks
const TREND = [48, 51, 50, 53, 49, 55, 57, 54, 52, 56, 58, 55, 59, 61, 57, 60, 58, 62, 59, 63];

const AUGMENTS = [
  { name: "Jeweled Gauntlet", games: 84, wr: 62, rarity: "prismatic" },
  { name: "Mystic Punch", games: 71, wr: 58, rarity: "gold" },
  { name: "Tap Dancer", games: 66, wr: 55, rarity: "silver" },
  { name: "Typhoon", games: 52, wr: 61, rarity: "prismatic" },
  { name: "Ice Cold", games: 47, wr: 49, rarity: "gold" },
  { name: "Scopier Weapons", games: 43, wr: 53, rarity: "silver" },
];

const INSIGHTS = [
  { title: "Best hour", value: "21:00–23:00", note: "61% win rate in 312 games" },
  { title: "After a loss", value: "47%", note: "Down from 54% overall" },
  { title: "Best duo", value: "Neon#Fox", note: "68% over 74 games together" },
  { title: "Comfort pick", value: "Ahri", note: "63% over 214 games" },
];

const MATCHES = [
  {
    id: 103,
    win: true,
    k: 12,
    d: 3,
    a: 9,
    score: 8.7,
    queue: "Ranked Solo",
    ago: "2h ago",
    len: "31:02",
    cs: 241,
  },
  {
    id: 222,
    win: true,
    k: 9,
    d: 4,
    a: 14,
    score: 7.9,
    queue: "Ranked Solo",
    ago: "3h ago",
    len: "27:48",
    cs: 228,
  },
  {
    id: 99,
    win: false,
    k: 4,
    d: 7,
    a: 11,
    score: 4.1,
    queue: "Ranked Flex",
    ago: "5h ago",
    len: "35:10",
    cs: 196,
  },
  {
    id: 157,
    win: true,
    k: 15,
    d: 6,
    a: 5,
    score: 8.2,
    queue: "Normal Draft",
    ago: "Yesterday",
    len: "29:33",
    cs: 257,
  },
  {
    id: 412,
    win: false,
    k: 1,
    d: 5,
    a: 19,
    score: 5.6,
    queue: "Ranked Solo",
    ago: "Yesterday",
    len: "33:21",
    cs: 41,
  },
  {
    id: 81,
    win: true,
    k: 10,
    d: 2,
    a: 8,
    score: 9.1,
    queue: "ARAM",
    ago: "2 days ago",
    len: "18:54",
    cs: 64,
  },
];

const PERIODS = ["24h", "7d", "30d", "Full"] as const;
const RARITY: Record<string, string> = {
  prismatic: "from-fuchsia-400 via-sky-300 to-amber-200",
  gold: "from-amber-300 to-amber-500",
  silver: "from-slate-200 to-slate-400",
};

// Shared surface: frosted glass with a thin violet rim
const GLASS =
  "rounded-3xl border border-white/[0.07] bg-[linear-gradient(160deg,rgb(255_255_255/0.05),rgb(255_255_255/0.01))] backdrop-blur-xl shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06),0_20px_50px_-30px_rgb(0_0_0/0.8)]";

function Card({
  title,
  aside,
  children,
  className = "",
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${GLASS} p-6 ${className}`}>
      {title && (
        <header className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.25em] text-violet-200/70">
            {title}
          </h2>
          {aside && <span className="text-[12px] text-white/40">{aside}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-white/40">
        {label}
      </div>
      <div
        className={`mt-1.5 font-display text-[26px] font-bold leading-none tabular-nums ${tone ?? "text-white"}`}
      >
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[11.5px] text-white/45">{sub}</div>}
    </div>
  );
}

function Ring({ value, size = 132, label }: { value: number; size?: number; label: string }) {
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(255 255 255 / 0.07)"
          strokeWidth={9}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#debug-ring)"
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`}
        />
        <defs>
          <linearGradient id="debug-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[28px] font-bold tabular-nums text-white">
          {value.toFixed(1)}%
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</span>
      </div>
    </div>
  );
}

function RankChip({ title, rank }: { title: string; rank: typeof PROFILE.solo }) {
  const wr = (rank.wins / (rank.wins + rank.losses)) * 100;
  return (
    <div className="min-w-[180px] rounded-2xl bg-black/30 p-4 ring-1 ring-white/[0.08] backdrop-blur">
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">{title}</div>
      <div className="mt-1 font-display text-[20px] font-bold" style={{ color: rank.color }}>
        {rank.tier} {rank.division}
      </div>
      <div className="mt-0.5 text-[12px] tabular-nums text-white/60">
        {rank.lp} LP · {rank.wins}W {rank.losses}L · {wr.toFixed(0)}%
      </div>
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full"
          style={{ width: `${rank.lp}%`, background: rank.color }}
        />
      </div>
    </div>
  );
}

function TrendChart() {
  const w = 600;
  const h = 150;
  const min = 44;
  const max = 66;
  const pts = TREND.map((v, i) => [
    (i / (TREND.length - 1)) * w,
    h - ((v - min) / (max - min)) * h,
  ]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const fifty = h - ((50 - min) / (max - min)) * h;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-[170px] w-full overflow-visible"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="debug-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        x1={0}
        x2={w}
        y1={fifty}
        y2={fifty}
        stroke="rgb(255 255 255 / 0.15)"
        strokeDasharray="4 6"
      />
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#debug-area)" />
      <path
        d={line}
        fill="none"
        stroke="#c4b5fd"
        strokeWidth={2.5}
        vectorEffect="non-scaling-stroke"
      />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 4.5 : 0} fill="#22d3ee" />
      ))}
    </svg>
  );
}

function Heatmap() {
  // 26 weeks × 7 days of made-up activity
  const cells = Array.from({ length: 26 * 7 }, (_, i) =>
    Math.round(Math.abs(Math.sin(i * 1.7) * Math.cos(i / 9)) * 4),
  );
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-[5px]">
      {cells.map((v, i) => (
        <span
          key={i}
          className="aspect-square rounded-[4px]"
          style={{
            background: v === 0 ? "rgb(255 255 255 / 0.05)" : `rgb(139 92 246 / ${0.2 + v * 0.2})`,
          }}
          title={`${v * 3} games`}
        />
      ))}
    </div>
  );
}

// Parked here until it gets a place in a real tab
function LastPlayedPanel() {
  const [account] = useActiveAccount();
  const champData = useChampionData();
  const queue = useScopedQueue(undefined);
  const { matches, loading } = useMatches({ account, queue }, 20);
  return (
    <Panel>
      <h2 className="mb-4 font-display text-[16px] font-semibold text-lol-text-bright">
        Last played champions
      </h2>
      <LastPlayed matches={matches} loading={loading} champData={champData} />
    </Panel>
  );
}

export default function DebugTesting() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("Full");
  const s = SUMMARY;
  const losses = s.games - s.wins;
  const kda = (s.kills + s.assists) / s.deaths;
  const topMastery = MASTERY[0].points;

  return (
    <div className="relative flex w-full flex-col gap-6 text-white">
      {/* Ambient light behind the whole page */}
      <div className="pointer-events-none absolute -top-24 left-1/4 h-80 w-[60%] rounded-full bg-violet-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute top-[40%] -right-20 h-72 w-80 rounded-full bg-cyan-500/10 blur-[120px]" />

      <div className="relative rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-[12px] text-amber-100">
        Debug preview: Your profile redesign with template data.
      </div>

      {/* Hero */}
      <section
        className={`${GLASS} relative overflow-hidden p-8`}
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgb(10 8 24 / 0.97) 30%, rgb(10 8 24 / 0.55) 70%, rgb(10 8 24 / 0.85)), url(https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_0.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center 20%",
        }}
      >
        <div className="flex flex-wrap items-center gap-8">
          <div className="relative">
            <div className="rounded-[28px] bg-gradient-to-br from-violet-400 to-cyan-300 p-[2px]">
              <SummonerIcon iconId={PROFILE.icon} size={116} className="rounded-[26px]" />
            </div>
            <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-[#0d0a1f] px-3 py-0.5 text-[11px] font-bold ring-1 ring-violet-400/50">
              {PROFILE.level}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-violet-200/70">
              Your profile
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              <span className="text-emerald-300">Live</span>
            </div>
            <h1 className="mt-2 font-display text-[44px] font-bold leading-none">
              {PROFILE.name}
              <span className="ml-2 text-[22px] font-medium text-white/40">#{PROFILE.tag}</span>
            </h1>
            <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
              <span className="rounded-full bg-white/[0.07] px-3 py-1 text-white/70">
                Region {PROFILE.region}
              </span>
              <span className="rounded-full bg-white/[0.07] px-3 py-1 text-white/70">
                {s.games} games
              </span>
              <span className="rounded-full bg-emerald-400/15 px-3 py-1 font-semibold text-emerald-300">
                W{PROFILE.streak} streak
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <RankChip title="Ranked Solo" rank={PROFILE.solo} />
            <RankChip title="Ranked Flex" rank={PROFILE.flex} />
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5">
          <div className="flex gap-1 rounded-full bg-black/40 p-1 ring-1 ring-white/[0.08]">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors ${
                  period === p
                    ? "bg-gradient-to-r from-violet-500 to-cyan-500 text-white shadow-[0_0_20px_-4px_rgb(139_92_246/0.8)]"
                    : "text-white/50 hover:text-white"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="rounded-full bg-white px-5 py-2 text-[12.5px] font-bold text-[#0d0a1f] transition-transform hover:scale-[1.03]"
          >
            Refresh
          </button>
        </div>
      </section>

      {/* Mastery · overview · multikills */}
      <div className="relative grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.35fr_1fr]">
        <Card title="Champion mastery" aside={`${MASTERY.length} champions`}>
          <div className="flex flex-col gap-3">
            {MASTERY.map((m, i) => (
              <div key={m.id} className="flex items-center gap-3">
                <span className="w-4 text-center text-[12px] text-white/30">{i + 1}</span>
                <ChampionIcon championId={m.id} size={38} className="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-[13px]">
                    <span className="font-semibold">{CHAMPS[m.id]}</span>
                    <span className="tabular-nums text-white/50">
                      {(m.points / 1000).toFixed(0)}k
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400"
                      style={{ width: `${(m.points / topMastery) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] font-bold text-violet-200">
                  M{m.level}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Overview" aside={`${s.wins}W ${losses}L`}>
          <div className="flex flex-wrap items-center gap-6">
            <Ring value={(s.wins / s.games) * 100} label="Win rate" />
            <div className="grid flex-1 grid-cols-2 gap-3">
              <Stat
                label="KDA"
                value={kda.toFixed(2)}
                sub={`${s.kills} / ${s.deaths} / ${s.assists}`}
                tone="text-violet-200"
              />
              <Stat label="Kill part." value={`${s.kp}%`} sub={`${s.dmgShare}% damage share`} />
              <Stat label="CS / min" value={s.csMin} sub={`${s.gold.toLocaleString()} gold`} />
              <Stat label="Avg length" value={s.length} sub="per game" />
            </div>
          </div>
        </Card>

        <Card title="Multikills" aside={`${MULTIKILLS.reduce((a, m) => a + m.count, 0)} total`}>
          <div className="flex flex-col gap-3">
            {MULTIKILLS.map((m, i) => (
              <div
                key={m.label}
                className="flex items-center gap-4 rounded-2xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/[0.05]"
              >
                <span
                  className="font-display text-[22px] font-bold tabular-nums"
                  style={{ color: ["#c4b5fd", "#a5b4fc", "#67e8f9", "#fcd34d"][i] }}
                >
                  {m.count}
                </span>
                <span className="flex-1 text-[13px] text-white/70">{m.label} kills</span>
                <span className="text-[11px] tabular-nums text-white/35">
                  {((m.count / s.games) * 100).toFixed(1)}% of games
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Win rate trend" aside="Last 20 weeks · dashed line is 50%" className="relative">
        <TrendChart />
      </Card>

      {/* Score · activity */}
      <div className="relative grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_2fr]">
        <Card title="Performance score">
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="Your avg"
              value={s.score.toFixed(2)}
              sub={`Team ${s.teamScore.toFixed(2)}`}
              tone="text-cyan-200"
            />
            <Stat
              label="MVP"
              value={s.mvp}
              sub={`${((s.mvp / s.games) * 100).toFixed(0)}% of games`}
              tone="text-amber-200"
            />
            <Stat label="Best" value={s.best.toFixed(2)} tone="text-emerald-300" />
            <Stat label="Worst" value={s.worst.toFixed(2)} tone="text-rose-300" />
            <Stat
              label="Ace"
              value={s.ace}
              sub={`${((s.ace / s.games) * 100).toFixed(0)}% of losses`}
            />
            <Stat
              label="Edge"
              value={`+${(s.score - s.teamScore).toFixed(2)}`}
              sub="above your team"
              tone="text-violet-200"
            />
          </div>
        </Card>
        <Card title="Activity" aside="Last 26 weeks">
          <Heatmap />
        </Card>
      </div>

      {/* Augments · insights */}
      <div className="relative grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Top augments" aside="by games">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {AUGMENTS.map((a) => (
              <div
                key={a.name}
                className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]"
              >
                <div className={`mb-3 h-9 w-9 rounded-xl bg-gradient-to-br ${RARITY[a.rarity]}`} />
                <div className="truncate text-[13px] font-semibold">{a.name}</div>
                <div className="mt-1 text-[11.5px] tabular-nums text-white/45">
                  <span className={a.wr >= 50 ? "text-emerald-300" : "text-rose-300"}>{a.wr}%</span>{" "}
                  · {a.games} games
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="How you play">
          <div className="grid grid-cols-2 gap-3">
            {INSIGHTS.map((x) => (
              <div
                key={x.title}
                className="rounded-2xl bg-gradient-to-br from-violet-500/[0.12] to-transparent p-5 ring-1 ring-violet-300/10"
              >
                <div className="text-[10.5px] uppercase tracking-[0.18em] text-white/40">
                  {x.title}
                </div>
                <div className="mt-2 font-display text-[22px] font-bold">{x.value}</div>
                <div className="mt-1 text-[12px] text-white/50">{x.note}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Match history */}
      <Card title="Full match history" aside={`${s.games} games`} className="relative">
        <div className="mb-4 flex flex-wrap gap-2">
          {["All", "Wins", "Losses", "All champions", "All patches", "Sort: Date"].map((f, i) => (
            <span
              key={f}
              className={`rounded-full px-3.5 py-1.5 text-[12px] ${
                i === 0 ? "bg-white text-[#0d0a1f] font-semibold" : "bg-white/[0.06] text-white/60"
              }`}
            >
              {f}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {MATCHES.map((m, i) => (
            <div
              key={i}
              className="group flex items-center gap-4 rounded-2xl bg-white/[0.025] px-4 py-3 ring-1 ring-white/[0.05] transition-colors hover:bg-white/[0.05]"
            >
              <span
                className={`h-10 w-1 rounded-full ${m.win ? "bg-emerald-400" : "bg-rose-400"}`}
              />
              <ChampionIcon championId={m.id} size={44} className="rounded-xl" />
              <div className="w-36">
                <div className="text-[14px] font-semibold">{CHAMPS[m.id]}</div>
                <div className="text-[11.5px] text-white/40">{m.queue}</div>
              </div>
              <div className="w-28 font-display text-[16px] font-bold tabular-nums">
                {m.k}
                <span className="text-white/30"> / </span>
                <span className="text-rose-300">{m.d}</span>
                <span className="text-white/30"> / </span>
                {m.a}
              </div>
              <div className="w-24 text-[12px] tabular-nums text-white/50">{m.cs} CS</div>
              <div className="w-24 text-[12px] tabular-nums text-white/50">{m.len}</div>
              <div className="flex-1 text-right text-[12px] text-white/40">{m.ago}</div>
              <span
                className={`w-14 rounded-lg py-1 text-center font-display text-[14px] font-bold tabular-nums ${
                  m.score >= 7 ? "bg-cyan-400/15 text-cyan-200" : "bg-white/[0.06] text-white/70"
                }`}
              >
                {m.score.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <LastPlayedPanel />
    </div>
  );
}
