import { useMemo } from "react";
import type { RuneOverview } from "../lib/types";
import { useIpc } from "../hooks/useIpc";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useChampionData, getChampionName, useRuneData } from "../hooks/useChampions";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import ChampionIcon from "./ChampionIcon";
import RuneIcon from "./RuneIcon";
import WinRateBar from "./WinRateBar";
import { Tile } from "./Tile";
import { TileGrid } from "./TileGrid";
import { SortableTable, type SortableColumn } from "./SortableTable";
import { formatNumber } from "../lib/format";

const RUNE_TILE_ACCENTS = ["#E5483F", "#C9A45C", "#22C55E", "#3B82F6", "#A855F7", "#64748B"];

type RuneChampionRow = {
  champion_id: number;
  rune_id: number;
  games: number;
  winRate: number;
};

export function RunesExp() {
  const champions = useChampionData();
  const runeData = useRuneData();
  const [activeAccountRaw] = useActiveAccount();
  const account = activeAccountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : activeAccountRaw;
  const { data, loading } = useIpc<RuneOverview>(
    () => window.api.getOwnedRuneStats(undefined, undefined, account),
    [account],
  );

  const keystones = useMemo(
    () =>
      (data?.runes ?? [])
        .filter((rune) => runeData[rune.rune_id]?.category === "keystone")
        .sort((a, b) => b.picks - a.picks),
    [data, runeData],
  );

  const championRows = useMemo<RuneChampionRow[]>(
    () =>
      (data?.champions ?? []).flatMap((champion) =>
        champion.keystones.map((keystone) => {
          const aggregate = data?.runes.find((rune) => rune.rune_id === keystone.rune_id);
          return {
            champion_id: champion.champion_id,
            rune_id: keystone.rune_id,
            games: keystone.picks,
            winRate:
              aggregate && aggregate.picks > 0 ? (aggregate.wins / aggregate.picks) * 100 : 0,
          };
        }),
      ),
    [data],
  );

  const columns = useMemo<SortableColumn<RuneChampionRow>[]>(
    () => [
      {
        key: "champion_id",
        label: "Champion",
        render: (row) => (
          <div className="nm">
            <ChampionIcon championId={row.champion_id} size={30} />
            <span>{getChampionName(champions, row.champion_id)}</span>
          </div>
        ),
        sortValue: (row) => getChampionName(champions, row.champion_id),
        defaultDir: "asc",
      },
      {
        key: "rune_id",
        label: "Keystone",
        render: (row) => (
          <span className="text-lol-text">
            {runeData[row.rune_id]?.name ?? `Rune ${row.rune_id}`}
          </span>
        ),
        sortValue: (row) => runeData[row.rune_id]?.name ?? "",
        defaultDir: "asc",
      },
      {
        key: "games",
        label: "Games",
        render: (row) => <span className="tabular-nums">{formatNumber(row.games)}</span>,
        defaultDir: "desc",
      },
      {
        key: "winRate",
        label: "Win rate",
        render: (row) => (
          <div className="flex min-w-[150px] items-center gap-2">
            <span className="w-12 tabular-nums">{row.winRate.toFixed(1)}%</span>
            <WinRateBar wins={row.winRate} total={100} />
          </div>
        ),
        defaultDir: "desc",
      },
    ],
    [champions, runeData],
  );

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div>
        <h1 className="relative pl-4 font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright before:absolute before:left-1 before:top-1/2 before:h-2 before:w-2 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson after:absolute after:bottom-[-8px] after:left-4 after:h-px after:w-28 after:bg-gradient-to-r after:from-lol-crimson/70 after:to-transparent">
          Runes
        </h1>
        <p className="mt-1.5 text-lol-text">Keystones and rune pages you actually play</p>
      </div>

      {loading || !data ? (
        <div className="py-8 text-center text-sm text-lol-text">Loading…</div>
      ) : (
        <>
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="relative pl-3 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-1.5 before:w-1.5 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson after:absolute after:bottom-[-6px] after:left-3 after:h-px after:w-20 after:bg-gradient-to-r after:from-lol-crimson/60 after:to-transparent">
                Keystones
              </h2>
              <span className="text-xs uppercase tracking-wider text-lol-text">All accounts</span>
            </div>
            <TileGrid>
              {keystones.map((rune, index) => {
                const winRate = rune.picks > 0 ? (rune.wins / rune.picks) * 100 : 0;
                return (
                  <Tile
                    key={rune.rune_id}
                    icon={
                      <RuneIcon
                        runeId={rune.rune_id}
                        path={runeData[rune.rune_id]?.icon}
                        size={38}
                      />
                    }
                    title={runeData[rune.rune_id]?.name ?? `Rune ${rune.rune_id}`}
                    subtitle={`${formatNumber(rune.picks)} games · ${winRate.toFixed(1)}% win`}
                    trackValue={winRate}
                    accent={RUNE_TILE_ACCENTS[index % RUNE_TILE_ACCENTS.length]}
                  />
                );
              })}
            </TileGrid>
          </section>

          <section>
            <div className="mb-3">
              <h2 className="relative pl-3 font-display text-xl font-semibold text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-1.5 before:w-1.5 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson after:absolute after:bottom-[-6px] after:left-3 after:h-px after:w-20 after:bg-gradient-to-r after:from-lol-crimson/60 after:to-transparent">
                Keystone by champion
              </h2>
            </div>
            <SortableTable
              columns={columns}
              rows={championRows}
              defaultSortKey="games"
              rowKey={(row) => `${row.champion_id}-${row.rune_id}`}
            />
          </section>
        </>
      )}
    </div>
  );
}
