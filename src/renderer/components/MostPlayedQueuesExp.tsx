import type { QueueStat } from "../../shared/api";
import { QUEUE_LABELS } from "../../shared/queues";
import { formatNumber } from "../lib/format";

export function MostPlayedQueuesExp({ rows }: { rows: QueueStat[] }) {
  return (
    <table className="w-full border-collapse text-[13.5px]">
      <thead>
        <tr>
          <th className="pb-2 text-left text-[12.5px] font-medium text-lol-text/60">Queue</th>
          <th className="pb-2 text-right text-[12.5px] font-medium text-lol-text/60">Games</th>
          <th className="pb-2 text-right text-[12.5px] font-medium text-lol-text/60">W / L</th>
          <th className="pb-2 text-right text-[12.5px] font-medium text-lol-text/60">Win rate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const winRate = row.count > 0 ? Math.round((row.wins / row.count) * 100) : 0;
          return (
            <tr key={row.queueId} className="border-t border-lol-border/40">
              <td className="py-2.5 text-left font-medium">
                {QUEUE_LABELS[row.queueId] ?? `Queue ${row.queueId}`}
              </td>
              <td className="py-2.5 text-right tabular-nums">{formatNumber(row.count)}</td>
              <td className="py-2.5 text-right tabular-nums">
                <span className="text-lol-win">{formatNumber(row.wins)}W</span>{" "}
                <span className="text-lol-loss">{formatNumber(row.losses)}L</span>
              </td>
              <td className="py-2.5 text-right tabular-nums text-lol-win">{winRate}%</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
