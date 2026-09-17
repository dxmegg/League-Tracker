import { useMemo, useState, useEffect } from "react";
import type { RuneOverview } from "../lib/types";
import WinRateBar from "../components/WinRateBar";
import ChampionIcon from "../components/ChampionIcon";
import RuneIcon from "../components/RuneIcon";
import { useIpc } from "../hooks/useIpc";
import { useChampionData, getChampionName } from "../hooks/useChampions";
import QueueSelect from "../components/QueueSelect";
import PatchSelect from "../components/PatchSelect";
import { isAugmentQueue } from "../../shared/queues";

export default function Runes({ queue }: { queue?: number }) {
  const [selectedQueue, setSelectedQueue] = useState<number | undefined>(queue);
  const [patch, setPatch] = useState<string | undefined>();
  useEffect(() => setSelectedQueue(queue), [queue]);
  const champions = useChampionData();
  const { data, loading } = useIpc<RuneOverview>(
    () => window.api.getOwnedRuneStats(selectedQueue, patch),
    [selectedQueue, patch],
  );
  const { data: runeData } = useIpc(() => window.api.getRuneData());
  const [search, setSearch] = useState("");
  const fallbackKeystones = new Set([
    8005, 8007, 8009, 8010, 8021, 8112, 8124, 8128, 8214, 8229, 8237, 8351, 8360, 8369, 8437, 8439,
    8465, 9923,
  ]);
  const rows = useMemo(() => {
    const query = search.toLowerCase();
    const result = (data?.runes ?? []).filter((r) =>
      runeData?.[r.rune_id]?.name?.toLowerCase().includes(query),
    );
    return result.sort((a, b) => b.picks - a.picks);
  }, [data, runeData, search]);
  const renderGroup = (title: string, category: "keystone" | "secondary") => {
    const group = rows.filter((r) => {
      const metadata = runeData?.[r.rune_id];
      // Keep stored rune usage visible even when Riot's metadata request is
      // temporarily unavailable; unknown entries belong in the secondary list.
      return (
        metadata?.category === category ||
        (!metadata &&
          (fallbackKeystones.has(r.rune_id) ? category === "keystone" : category === "secondary"))
      );
    });
    return (
      <section className="rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] overflow-hidden p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-lol-gold">{title}</h2>
        <div className="overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-lol-border/40">
              <tr>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-lol-text">
                  #
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-lol-text">
                  RUNE
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-lol-text">
                  GAMES
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-lol-text">
                  WIN RATE
                </th>
              </tr>
            </thead>
            <tbody>
              {group.map((r, index) => (
                <tr
                  key={r.rune_id}
                  className="group border-b border-lol-border/20 transition-colors hover:bg-white/[0.03]"
                >
                  <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                    {index + 1}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-3 text-sm font-bold text-lol-text-bright">
                      <RuneIcon runeId={r.rune_id} path={runeData?.[r.rune_id]?.icon} size={28} />
                      {runeData?.[r.rune_id]?.name ?? `Rune ${r.rune_id}`}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-lol-text tabular-nums">
                    {r.picks}
                  </td>
                  <td className="min-w-0 px-3 py-2">
                    <WinRateBar wins={r.wins} total={r.picks} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  };
  if (loading)
    return (
      <div className="flex items-center justify-center rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] p-12">
        <p className="text-sm text-lol-text">Loading...</p>
      </div>
    );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <div className="flex gap-2">
          {queue == null && (
            <div className="[&_select]:h-9 [&_select]:rounded-md [&_select]:border [&_select]:border-lol-border/60 [&_select]:bg-lol-card/40 [&_select]:px-3 [&_select]:text-xs [&_select]:text-lol-text-bright [&_select]:focus-visible:outline-none [&_select]:focus-visible:border-lol-gold/60 [&_select]:focus-visible:ring-1 [&_select]:focus-visible:ring-lol-gold/40 [&_select]:transition-colors">
              <QueueSelect
                value={selectedQueue}
                onChange={setSelectedQueue}
                filter={(id) => !isAugmentQueue(id)}
              />
            </div>
          )}
          <PatchSelect
            value={patch}
            onChange={(value) => {
              setPatch(value);
              // Rune payloads are archived by match and the backend currently
              // has no patch argument; patch selection is metadata/icon-only.
            }}
          />
          <input
            className="input w-48"
            placeholder="Search rune name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      {renderGroup("Keystones", "keystone")}
      {renderGroup("Secondaries", "secondary")}
      {!data?.runes?.length && (
        <div className="rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] p-12 text-center">
          <p className="text-sm text-lol-text">
            No rune data is available in the archived match payloads for this history scope.
          </p>
        </div>
      )}

      <section className="rounded-lg border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] shadow-[0_0_3px_rgba(150,30,30,0.55),0_0_10px_rgba(90,15,15,0.35),0_0_20px_rgba(60,10,10,0.20)] ring-1 ring-inset ring-white/[0.03] overflow-hidden p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-lol-gold">
          Champions and most-used keystones
        </h2>
        <div className="grid gap-2 md:grid-cols-2">
          {(data?.champions ?? []).map((champion) => (
            <div
              key={champion.champion_id}
              className="flex items-center gap-3 rounded-md border border-lol-border/40 bg-white/[0.02] p-3 transition-colors hover:border-lol-gold/40 hover:bg-white/[0.04]"
            >
              <ChampionIcon championId={champion.champion_id} size={32} />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-lol-text-bright">
                {getChampionName(champions, champion.champion_id)}
              </span>
              <div className="flex items-center gap-2">
                {champion.keystones.map((rune) => (
                  <span key={rune.rune_id} className="flex flex-col items-center gap-0.5">
                    <RuneIcon
                      runeId={rune.rune_id}
                      path={runeData?.[rune.rune_id]?.icon}
                      size={28}
                    />
                    <span className="text-[10px] text-lol-text">{rune.picks}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
