import { useEffect, type ReactNode } from "react";
import type { ChampionMatchupRow, MatchInsights } from "../../shared/api";
import { QUEUE_LABELS } from "../../shared/queues";
import { getChampionName, useChampionData } from "../hooks/useChampions";
import { useIpc } from "../hooks/useIpc";
import { formatNumber } from "../lib/format";
import ChampionIcon from "./ChampionIcon";
import { Panel } from "./Panel";
import WinRateBar from "./WinRateBar";
import { Title } from "./live/shared";

// Fewer games than this against one champion say nothing about the matchup
const MIN_GAMES = 5;
// Tiers are relative to your own average, or a strong player would put nearly everyone in S.
// The numbers are the lowest distance from that average each tier accepts.
const TIERS = [
  { tier: "S", from: 0.08 },
  { tier: "A", from: 0.03 },
  { tier: "B", from: -0.03 },
  { tier: "C", from: -0.08 },
  { tier: "D", from: -1 },
];
function Line({ name, games, wins }: { name: ReactNode; games: number; wins: number }) {
  return (
    <div className="flex items-center gap-3 border-b border-lol-border/40 py-1.5 text-[13px] last:border-0">
      <span className="min-w-0 flex-1 truncate text-lol-text-bright">{name}</span>
      <span className="text-[11px] tabular-nums text-lol-text">{formatNumber(games)}x</span>
      {games > 0 ? <WinRateBar wins={wins} total={games} /> : <span>—</span>}
    </div>
  );
}

// Win rate by gold lead, CS pace, economy by queue, matchup tiers and results against classes
export function TrendsInsights({ queue, account }: { queue?: number; account: string }) {
  const champData = useChampionData();
  const { data, refetch } = useIpc<MatchInsights>(
    () => window.api.getMatchInsights(queue, account),
    [queue, account],
  );
  const { data: matchups, refetch: refetchMatchups } = useIpc<ChampionMatchupRow[] | null>(
    () => window.api.getChampionMatchupList(null, undefined, queue, account),
    [queue, account],
  );

  useEffect(
    () =>
      window.api.onGamesUpdated(() => {
        refetch();
        refetchMatchups();
      }),
    [refetch, refetchMatchups],
  );

  const rows = matchups ?? [];
  const rate = (r: { games: number; wins: number }) => r.wins / r.games;
  const rated = rows.filter((r) => r.games >= MIN_GAMES);
  const average =
    rated.reduce((n, r) => n + r.wins, 0) / (rated.reduce((n, r) => n + r.games, 0) || 1);
  const tierOf = (r: ChampionMatchupRow) => TIERS.find((t) => rate(r) - average >= t.from)?.tier;
  const tiers = TIERS.map(({ tier }) => ({
    tier,
    champions: rated.filter((r) => tierOf(r) === tier).sort((a, b) => rate(b) - rate(a)),
  }));
  const classes = new Map<string, { games: number; wins: number }>();
  for (const r of rows) {
    const name = champData?.[r.championId]?.class;
    if (!name) continue;
    const total = classes.get(name) ?? { games: 0, wins: 0 };
    classes.set(name, { games: total.games + r.games, wins: total.wins + r.wins });
  }
  const timed = data?.leads.filter((l) => l.games > 0) ?? [];

  return (
    <>
      {/* The range buttons above do not reach these panels */}
      {data && <p className="text-[12px] text-lol-text">Below: all your saved games, any date.</p>}
      {timed.length > 0 && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {timed.map((lead) => (
            <Panel key={lead.minute} variant="tile">
              <Title
                aside={
                  <span className="text-[12px] text-lol-text">
                    {lead.avgCs != null && `your CS ${lead.avgCs.toFixed(1)}`}
                  </span>
                }
              >
                Win rate at {lead.minute} min
              </Title>
              {lead.buckets.map((b) => (
                <Line key={b.label} name={b.label} games={b.games} wins={b.wins} />
              ))}
            </Panel>
          ))}
        </div>
      )}

      {data && data.queues.length > 0 && (
        <Panel variant="tile">
          <Title>Economy and objectives by queue</Title>
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-lol-text">
                <th className="py-1">Queue</th>
                <th>Games</th>
                <th>Gold / min</th>
                <th>CS / min</th>
                <th>Objective damage</th>
                <th>Turret damage</th>
              </tr>
            </thead>
            <tbody>
              {data.queues.map((q) => (
                <tr key={q.queueId} className="border-t border-lol-border/40 text-lol-text-bright">
                  <td className="py-1.5">{QUEUE_LABELS[q.queueId] ?? `Queue ${q.queueId}`}</td>
                  <td>{formatNumber(q.games)}</td>
                  <td>{q.goldPerMin?.toFixed(0) ?? "—"}</td>
                  <td>{q.csPerMin?.toFixed(1) ?? "—"}</td>
                  <td>{formatNumber(Math.round(q.objectiveDamage ?? 0))}</td>
                  <td>{formatNumber(Math.round(q.turretDamage ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {rows.length > 0 && (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
          <Panel variant="tile" className="xl:col-span-2">
            <Title
              aside={
                <span className="text-[12px] text-lol-text">
                  win rate against, compared with your {(average * 100).toFixed(0)}%, min{" "}
                  {MIN_GAMES} games
                </span>
              }
            >
              Matchup tier list
            </Title>
            {tiers.map(({ tier, champions }) => (
              <div key={tier} className="flex gap-3 border-t border-lol-border/40 py-2">
                <span className="w-6 shrink-0 font-display text-[18px] font-bold text-lol-gold">
                  {tier}
                </span>
                <div className="flex flex-wrap gap-1">
                  {champions.map((c) => {
                    const label = `${getChampionName(champData, c.championId)}: ${((c.wins / c.games) * 100).toFixed(0)}% of ${c.games}`;
                    return (
                      <span key={c.championId} title={label} aria-label={label} role="img">
                        <ChampionIcon championId={c.championId} size={32} className="rounded-md" />
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </Panel>
          <Panel variant="tile">
            <Title>Against champion classes</Title>
            {[...classes]
              .sort((a, b) => b[1].games - a[1].games)
              .map(([name, total]) => (
                <Line key={name} name={name} games={total.games} wins={total.wins} />
              ))}
          </Panel>
        </div>
      )}
    </>
  );
}
