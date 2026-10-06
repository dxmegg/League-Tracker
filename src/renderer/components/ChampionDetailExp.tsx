import { useMemo, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  AugmentStats,
  ChampionKeystoneStat,
  ChampionMatchups,
  ChampionQueueStat,
  ChampionStats,
  ChampionWeeklyWinRate,
  ItemStats,
  MatchListItem,
} from "../../shared/api";
import { QUEUE_LABELS } from "../../shared/queues";
import AugmentIcon from "./AugmentIcon";
import ChampionIcon from "./ChampionIcon";
import ItemIcon from "./ItemIcon";
import { LineChartExp } from "./LineChartExp";
import { MatchRowExperiment } from "./MatchRowExperiment";
import { Panel } from "./Panel";
import PatchSelect from "./PatchSelect";
import RuneIcon from "./RuneIcon";
import { FilterSelect } from "./FilterSelect";
import WinRateBar from "./WinRateBar";
import {
  getAugmentName,
  getChampionName,
  getItemName,
  useAugmentData,
  useChampionData,
  useItemData,
  useRuneData,
} from "../hooks/useChampions";
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

  const { data: keystones, loading: keystonesLoading } = useIpc<ChampionKeystoneStat[]>(
    () => window.api.getChampionKeystones(id, account),
    [id, account],
  );

  const { data: queueStats, loading: queueStatsLoading } = useIpc<ChampionQueueStat[]>(
    () => window.api.getChampionQueueStats(id, account),
    [id, account],
  );

  const { data: weeklyWinRate, loading: weeklyWinRateLoading } = useIpc<ChampionWeeklyWinRate[]>(
    () => window.api.getChampionWeeklyWinRate(id, account),
    [id, account],
  );

  const { data: matchups, loading: matchupsLoading } = useIpc<ChampionMatchups>(
    () => window.api.getChampionMatchups(id, account),
    [id, account],
  );

  const { data: items, loading: itemsLoading } = useIpc<ItemStats[]>(
    () => window.api.getChampionItemStats(id, patch, scopedQueue, account),
    [id, patch, scopedQueue, account],
  );

  const { data: augments, loading: augmentsLoading } = useIpc<AugmentStats[]>(
    () => window.api.getAugmentStats(id, patch, scopedQueue, account),
    [id, patch, scopedQueue, account],
  );

  const augmentData = useAugmentData(patch);
  const itemData = useItemData(patch);
  const runeData = useRuneData();
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
            allowClear
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

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Panel>
              <SectionHeading title="Top augments" aside="Pick rate and win rate" />
              {augmentsLoading || !augments ? (
                <SectionLoading />
              ) : (
                <div className="flex flex-col gap-1.5">
                  {augments
                    .slice()
                    .sort((a, b) => b.picks - a.picks)
                    .slice(0, 6)
                    .map((a) => (
                      <RateRow
                        key={a.augment_id}
                        icon={<AugmentIcon augmentId={a.augment_id} size={24} />}
                        name={getAugmentName(augmentData, a.augment_id)}
                        wins={a.wins}
                        total={a.picks}
                        count={`${a.picks}x`}
                      />
                    ))}
                  {augments.length === 0 && <NoData />}
                </div>
              )}
            </Panel>

            <Panel>
              <SectionHeading title="Top items" aside="Most built" />
              {itemsLoading || !items ? (
                <SectionLoading />
              ) : (
                <div className="flex flex-col gap-1.5">
                  {items
                    .slice()
                    .sort((a, b) => b.picks - a.picks)
                    .slice(0, 6)
                    .map((item) => (
                      <RateRow
                        key={item.item_id}
                        icon={<ItemIcon itemId={item.item_id} size={24} patch={patch} />}
                        name={getItemName(itemData, item.item_id)}
                        wins={item.wins}
                        total={item.picks}
                        count={`${item.picks}x`}
                      />
                    ))}
                  {items.length === 0 && <NoData />}
                </div>
              )}
            </Panel>

            <Panel>
              <SectionHeading title="Keystones" aside="Picks" />
              {keystonesLoading || !keystones ? (
                <SectionLoading />
              ) : (
                <div className="flex flex-col gap-1.5">
                  {keystones
                    .slice()
                    .sort((a, b) => b.picks - a.picks)
                    .slice(0, 6)
                    .map((keystone) => (
                      <RateRow
                        key={keystone.runeId}
                        icon={
                          <RuneIcon
                            runeId={keystone.runeId}
                            path={runeData[keystone.runeId]?.icon}
                            size={22}
                          />
                        }
                        name={runeData[keystone.runeId]?.name ?? `Rune ${keystone.runeId}`}
                        wins={keystone.wins}
                        total={keystone.picks}
                        count={`${keystone.picks}x`}
                      />
                    ))}
                  {keystones.length === 0 && <NoData />}
                </div>
              )}
            </Panel>

            <Panel>
              <SectionHeading title="Games by queue" />
              {queueStatsLoading || !queueStats ? (
                <SectionLoading />
              ) : (
                <div className="flex flex-col gap-1.5">
                  {queueStats.map((queueStat) => {
                    const queueWr =
                      queueStat.games > 0 ? (queueStat.wins / queueStat.games) * 100 : 0;
                    return (
                      <div
                        key={queueStat.queueId}
                        className="flex items-center gap-3 rounded-lg bg-black/10 px-3 py-2 text-[12px]"
                      >
                        <span className="min-w-0 flex-1 truncate text-lol-text-bright">
                          {QUEUE_LABELS[queueStat.queueId] ?? `Queue ${queueStat.queueId}`}
                        </span>
                        <span className="shrink-0 text-lol-text">{queueStat.games}</span>
                        <span className="shrink-0 text-lol-text">
                          <span className="text-lol-win">{queueStat.wins}W</span>{" "}
                          <span className="text-lol-loss">{queueStat.games - queueStat.wins}L</span>
                        </span>
                        <span
                          className={`w-12 shrink-0 text-right tabular-nums ${
                            queueWr >= 50 ? "text-lol-win" : "text-lol-loss"
                          }`}
                        >
                          {queueWr.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                  {queueStats.length === 0 && <NoData />}
                </div>
              )}
            </Panel>

            <Panel className="xl:col-span-2">
              <SectionHeading title="Win rate by week" />
              {weeklyWinRateLoading || !weeklyWinRate ? (
                <SectionLoading />
              ) : (
                <LineChartExp
                  values={weeklyWinRate.map((week) =>
                    week.games > 0 ? (week.wins / week.games) * 100 : 0,
                  )}
                  format={(value) => value.toFixed(1) + "%"}
                  color="var(--theme-win)"
                  min={20}
                  max={100}
                />
              )}
            </Panel>

            <div className="grid grid-cols-1 gap-5 xl:col-span-2 xl:grid-cols-2">
              <Panel>
                <div className="mb-4 flex items-baseline justify-between">
                  <h2 className="font-display text-[16px] font-semibold text-lol-win">
                    Best matchups
                  </h2>
                  <span className="text-[13px] text-lol-text">Your win rate vs</span>
                </div>
                {matchupsLoading || !matchups ? (
                  <SectionLoading />
                ) : (
                  <div className="flex flex-col gap-2">
                    {matchups.best.length === 0 ? (
                      <p className="py-4 text-center text-[13px] text-lol-text">No data</p>
                    ) : (
                      matchups.best.map((m) => {
                        const wr = m.games > 0 ? (m.wins / m.games) * 100 : 0;
                        return (
                          <div
                            key={m.championId}
                            className="grid grid-cols-[28px_minmax(0,1fr)_32px_minmax(80px,1fr)_48px] items-center gap-2.5"
                          >
                            <ChampionIcon
                              championId={m.championId}
                              size={28}
                              className="rounded-lg"
                            />
                            <span className="truncate text-[13.5px] text-lol-text-bright">
                              {getChampionName(champData, m.championId)}
                            </span>
                            <span className="text-right text-[11.5px] tabular-nums text-lol-text/70">
                              {m.games}g
                            </span>
                            <div className="h-[5px] overflow-hidden rounded-full bg-white/[0.05]">
                              <i
                                className="block h-full rounded-full bg-lol-win"
                                style={{ width: `${Math.min(100, wr)}%` }}
                              />
                            </div>
                            <span className="text-right text-[12px] font-semibold tabular-nums text-lol-win">
                              {wr.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </Panel>

              <Panel>
                <div className="mb-4 flex items-baseline justify-between">
                  <h2 className="font-display text-[16px] font-semibold text-lol-loss">
                    Worst matchups
                  </h2>
                  <span className="text-[13px] text-lol-text">Your win rate vs</span>
                </div>
                {matchupsLoading || !matchups ? (
                  <SectionLoading />
                ) : (
                  <div className="flex flex-col gap-2">
                    {matchups.worst.length === 0 ? (
                      <p className="py-4 text-center text-[13px] text-lol-text">No data</p>
                    ) : (
                      matchups.worst.map((m) => {
                        const wr = m.games > 0 ? (m.wins / m.games) * 100 : 0;
                        return (
                          <div
                            key={m.championId}
                            className="grid grid-cols-[28px_minmax(0,1fr)_32px_minmax(80px,1fr)_48px] items-center gap-2.5"
                          >
                            <ChampionIcon
                              championId={m.championId}
                              size={28}
                              className="rounded-lg"
                            />
                            <span className="truncate text-[13.5px] text-lol-text-bright">
                              {getChampionName(champData, m.championId)}
                            </span>
                            <span className="text-right text-[11.5px] tabular-nums text-lol-text/70">
                              {m.games}g
                            </span>
                            <div className="h-[5px] overflow-hidden rounded-full bg-white/[0.05]">
                              <i
                                className="block h-full rounded-full bg-lol-loss"
                                style={{ width: `${Math.min(100, wr)}%` }}
                              />
                            </div>
                            <span className="text-right text-[12px] font-semibold tabular-nums text-lol-loss">
                              {wr.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </Panel>
            </div>
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

function SectionHeading({ title, aside }: { title: string; aside?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-[16px] font-semibold text-lol-text-bright">{title}</h2>
      {aside && <span className="text-[12px] text-lol-text">{aside}</span>}
    </div>
  );
}

function SectionLoading() {
  return <p className="py-3 text-sm text-lol-text">Loading…</p>;
}

function NoData() {
  return <span className="text-[12.5px] text-lol-text">No data</span>;
}

function RateRow({
  icon,
  name,
  wins,
  total,
  count,
}: {
  icon: ReactNode;
  name: string;
  wins: number;
  total: number;
  count: string;
}) {
  const rate = total > 0 ? (wins / total) * 100 : 0;
  return (
    <div className="flex min-w-0 items-center gap-2">
      {icon}
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-lol-text-bright">{name}</span>
      <span className="shrink-0 text-[11px] text-lol-text">{count}</span>
      <div className="w-20 shrink-0">
        <WinRateBar wins={wins} total={total} showPercent={false} />
      </div>
      <span
        className={`w-11 shrink-0 text-right text-[11px] tabular-nums ${
          rate >= 50 ? "text-lol-win" : "text-lol-loss"
        }`}
      >
        {rate.toFixed(1)}%
      </span>
    </div>
  );
}
