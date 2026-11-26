import { Link, useParams } from "react-router-dom";
import type { AugmentDetail } from "../../shared/api";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { getAugmentName, getItemName, useAugmentData, useItemData } from "../hooks/useChampions";
import { useIpc } from "../hooks/useIpc";
import { useViewState } from "../hooks/useViewState";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { formatDuration, formatNumber, kdaRatio } from "../lib/format";
import { useScopedQueue } from "../lib/historyScope";
import AugmentIcon from "../components/AugmentIcon";
import { rarityOf } from "./Augments";
import { ChampionBreakdown } from "../components/ChampionBreakdown";
import { ItemInsights } from "../components/ItemInsights";
import ItemIcon from "../components/ItemIcon";
import { Panel } from "../components/Panel";
import RiotText from "../components/RiotText";
import { HeroTile, SplashHero } from "../components/SplashHero";
import WinRateBar from "../components/WinRateBar";
import { Title } from "../components/live/shared";

const CARD = "min-w-0 rounded-xl border border-lol-border/50 bg-black/25 p-3";

function PairCard({
  icon,
  name,
  games,
  wins,
}: {
  icon: React.ReactNode;
  name: string;
  games: number;
  wins: number;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5">
        {icon}
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-lol-text-bright">{name}</div>
          <div className="text-[10px] text-lol-text">{games} games</div>
        </div>
      </div>
      <div className="mt-2">
        <WinRateBar wins={wins} total={games} />
      </div>
    </>
  );
}

export default function AugmentDetail() {
  const { augmentId } = useParams<{ augmentId: string }>();
  const id = Number(augmentId);
  // The filters chosen on the Augments list carry over
  const [patch] = useViewState<string | undefined>("augments.patch", undefined);
  const [queue] = useViewState<number | undefined>("augments.queue", undefined);
  const scopedQueue = useScopedQueue(queue);
  const [accountRaw] = useActiveAccount();
  const account = accountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : accountRaw;
  const augments = useAugmentData(patch);
  const items = useItemData(patch);
  const { data, loading, error } = useIpc<AugmentDetail>(
    () => window.api.getAugmentDetail(id, patch, scopedQueue, account),
    [id, patch, scopedQueue, account],
  );

  const back = (
    <Link
      to="/augments"
      className="w-fit rounded-lg border border-lol-border bg-[var(--theme-card)] px-3 py-1.5 text-sm font-medium text-lol-text-bright transition-colors hover:border-lol-crimson/70"
    >
      ← All augments
    </Link>
  );

  if (loading || !data || data.picks === 0) {
    return (
      <div className="flex w-full flex-col gap-5">
        {back}
        <p className="py-10 text-center text-sm text-lol-text">
          {error
            ? "Could not load this augment."
            : loading || !data
              ? "Loading augment details…"
              : "No games with this augment for the selected filters."}
        </p>
      </div>
    );
  }

  const info = augments[id];
  const name = getAugmentName(augments, id);
  const rarity = rarityOf(info?.rarity);
  const games = data.champions.flatMap((row) => row.matches);
  const total = (pick: (g: (typeof games)[number]) => number) =>
    games.reduce((sum, g) => sum + pick(g), 0);
  const winRate = (data.wins / data.picks) * 100;

  return (
    <div className="flex min-h-full w-full flex-col gap-5">
      {back}

      <SplashHero championId={data.champions[0]?.champion_id}>
        <div className="flex items-center gap-5">
          <div className="shrink-0 overflow-hidden rounded-2xl border border-lol-crimson/50 bg-black/40 p-1.5 shadow-[0_0_28px_var(--theme-crimson-glow)]">
            <AugmentIcon augmentId={id} size={84} patch={patch} />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-[34px] font-bold leading-tight text-lol-text-bright">
              {name}
            </h1>
            <p className="mt-2 text-[13px] text-lol-text">
              {rarity && (
                <span className="mr-2 font-semibold" style={{ color: rarity.color }}>
                  {rarity.label}
                </span>
              )}
              Taken in {formatNumber(data.picks)} games ·{" "}
              <span className="text-lol-win">{data.wins}W</span>{" "}
              <span className="text-lol-loss">{data.picks - data.wins}L</span>
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          <HeroTile
            label="Win rate"
            value={`${winRate.toFixed(1)}%`}
            valueClass={winRate >= 50 ? "text-lol-win" : "text-lol-loss"}
          />
          <HeroTile
            label="Pick rate"
            value={`${((data.picks / Math.max(data.totalGames, 1)) * 100).toFixed(1)}%`}
            sub={`${data.picks} of ${data.totalGames} games`}
          />
          <HeroTile
            label="Avg KDA"
            value={kdaRatio(
              total((g) => g.kills),
              total((g) => g.deaths),
              total((g) => g.assists),
            )}
          />
          <HeroTile
            label="Avg damage"
            value={formatNumber(Math.round(total((g) => g.damage) / data.picks))}
          />
          <HeroTile
            label="Avg duration"
            value={formatDuration(Math.round(total((g) => g.game_duration) / data.picks))}
          />
          <HeroTile label="Champions" value={String(data.champions.length)} sub="tried with it" />
        </div>
      </SplashHero>

      <Panel variant="tile">
        <Title>Description</Title>
        <div className="text-sm leading-relaxed text-lol-text">
          <RiotText markup={info?.desc || "No description available."} />
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel variant="tile">
          <Title>Taken together with</Title>
          <div className="grid grid-cols-2 gap-3">
            {data.pairings.map((pair) => (
              <Link
                key={pair.id}
                to={`/augments/${pair.id}`}
                className={`${CARD} transition-colors hover:border-lol-crimson/60`}
              >
                <PairCard
                  icon={<AugmentIcon augmentId={pair.id} size={32} patch={patch} />}
                  name={getAugmentName(augments, pair.id)}
                  games={pair.games}
                  wins={pair.wins}
                />
              </Link>
            ))}
          </div>
        </Panel>
        <Panel variant="tile">
          <Title>Items built with it</Title>
          <div className="grid grid-cols-2 gap-3">
            {data.topItems.map((item) => (
              <Link
                key={item.id}
                to={`/items/${item.id}`}
                className={`${CARD} transition-colors hover:border-lol-crimson/60`}
              >
                <PairCard
                  icon={<ItemIcon itemId={item.id} size={32} patch={patch} />}
                  name={getItemName(items, item.id)}
                  games={item.games}
                  wins={item.wins}
                />
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <ItemInsights data={data} noun="augment" />
      <ChampionBreakdown data={data} noun="augment" />
    </div>
  );
}
