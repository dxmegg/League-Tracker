import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ChampionStats, MatchListItem } from "../../shared/api";
import ChampionIcon from "./ChampionIcon";
import { MatchRowExperiment } from "./MatchRowExperiment";
import { Panel } from "./Panel";
import PatchSelect from "./PatchSelect";
import { FilterSelect } from "./FilterSelect";
import { useChampionData, getChampionName } from "../hooks/useChampions";
import { useHistoryScopeQueue } from "../lib/historyScope";
import { useIpc } from "../hooks/useIpc";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useViewState } from "../hooks/useViewState";
import { formatNumber } from "../lib/format";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";

export function ChampionDetailExp() {
  const { championId = "" } = useParams<{ championId: string }>();
  const id = Number(championId);
  const navigate = useNavigate();
  const champData = useChampionData();

  const [patch, setPatch] = useViewState<string | undefined>("champions.patch", undefined);
  const [queue, setQueue] = useViewState<number | undefined>("champions.queue", undefined);
  const scopedQueue = queue ?? useHistoryScopeQueue();
  const [activeAccountRaw] = useActiveAccount();
  const account = activeAccountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : activeAccountRaw;

  const { data: allStats } = useIpc<ChampionStats[]>(
    () => window.api.getChampionStats(patch, scopedQueue, account),
    [patch, scopedQueue, account],
  );

  const stats = useMemo(() => allStats?.find((s) => s.champion_id === id) ?? null, [allStats, id]);

  const { data: matchHistory } = useIpc<{ matches: MatchListItem[]; total: number }>(
    () => window.api.getChampionMatchHistory(id, 20, 0, patch, scopedQueue, account),
    [id, patch, scopedQueue, account],
  );

  const name = getChampionName(champData, id);
  const games = stats?.games ?? 0;
  const wins = stats?.wins ?? 0;
  const losses = games - wins;
  const wr = games > 0 ? (wins / games) * 100 : 0;
  const kda = stats && stats.deaths > 0 ? (stats.kills + stats.assists) / stats.deaths : null;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <button
        type="button"
        onClick={() => navigate("/champions")}
        className="self-start rounded-lg border border-lol-border bg-lol-card px-3 py-1.5 text-sm font-medium text-lol-text-bright transition-colors hover:border-lol-crimson"
      >
        ← All champions
      </button>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-lol-border bg-[linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-5">
        <div className="flex min-w-0 items-center gap-4">
          <ChampionIcon championId={id} size={76} className="rounded-2xl" />
          <div className="min-w-0">
            <h1 className="font-display text-[28px] font-bold leading-tight text-lol-text-bright">
              {name}
            </h1>
            <p className="mt-1 text-lol-text">
              {formatNumber(games)} games · {formatNumber(wins)}W {formatNumber(losses)}L
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            value={queue != null ? String(queue) : undefined}
            onChange={(v) => setQueue(v === undefined ? undefined : Number(v))}
            placeholder="All queues"
            title="Queue"
            options={[
              { value: "420", label: "Ranked Solo" },
              { value: "440", label: "Ranked Flex" },
              { value: "450", label: "ARAM" },
              { value: "400", label: "Normal" },
              { value: "1700", label: "Arena" },
            ]}
          />
          <PatchSelect value={patch} onChange={setPatch} />
        </div>
      </div>

      {!stats || games === 0 ? (
        <Panel>
          <p className="py-8 text-center text-sm text-lol-text">
            No games with this champion for the selected filters.
          </p>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Stat
              label="Games"
              value={formatNumber(games)}
              sub={`${formatNumber(wins)}W · ${formatNumber(losses)}L`}
            />
            <Stat
              label="Win rate"
              value={`${wr.toFixed(1)}%`}
              sub=""
              valueClass={wr >= 50 ? "text-lol-win" : "text-lol-loss"}
            />
            <Stat
              label="KDA"
              value={kda != null ? kda.toFixed(2) : "Perfect"}
              sub={`${stats.avg_kills.toFixed(1)} / ${stats.avg_deaths.toFixed(1)} / ${stats.avg_assists.toFixed(1)}`}
              valueClass={
                kda != null && kda >= 4
                  ? "text-lol-gold"
                  : kda != null && kda >= 3
                    ? "text-lol-win"
                    : ""
              }
            />
            <Stat
              label="CS / min"
              value={stats.avg_cs_per_min != null ? stats.avg_cs_per_min.toFixed(1) : "—"}
              sub=""
            />
            <Stat
              label="Score"
              value={stats.avg_score != null ? stats.avg_score.toFixed(1) : "—"}
              sub=""
              valueClass="text-lol-gold"
            />
            <Stat
              label="MVP / ACE"
              value={`${formatNumber(stats.mvps)} / ${formatNumber(stats.aces)}`}
              sub=""
            />
            <Stat label="Avg damage" value={formatNumber(stats.avg_damage)} sub="" />
            <Stat label="Avg gold" value={formatNumber(stats.avg_gold)} sub="" />
          </div>

          <Panel>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-[16px] font-semibold text-lol-text-bright">
                Recent games
              </h2>
              <span className="text-[13px] text-lol-text">
                {matchHistory?.matches.length ?? 0} loaded
                {matchHistory?.total ? ` · up to ${matchHistory.total} available` : ""}
              </span>
            </div>
            <div
              className="match-list-exp flex flex-col gap-2.5"
              style={{ containerType: "inline-size" }}
            >
              {(matchHistory?.matches ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-lol-text">No games</p>
              ) : (
                matchHistory!.matches.map((match) => (
                  <MatchRowExperiment
                    key={match.game_id}
                    match={match}
                    championName={name}
                    champData={champData}
                  />
                ))
              )}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  valueClass = "",
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-lol-border bg-black/10 px-3.5 py-3">
      <span className="text-[12.5px] uppercase tracking-wider text-lol-text">{label}</span>
      <b
        className={`my-0.5 block font-display text-[24px] font-bold leading-tight text-lol-text-bright ${valueClass}`}
      >
        {value}
      </b>
      {sub && <div className="text-[12px] text-lol-text">{sub}</div>}
    </div>
  );
}
