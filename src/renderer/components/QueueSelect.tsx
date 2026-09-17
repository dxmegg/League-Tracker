import { useState, useEffect } from "react";
import { QUEUE_LABELS } from "../../shared/queues";
import { QUEUE_GROUP_ARENA } from "../../shared/queues";
import { useHistoryScopeQueue } from "../lib/historyScope";

export function queueLabel(queueId: number): string {
  return QUEUE_LABELS[queueId] ?? `Queue ${queueId}`;
}

export default function QueueSelect({
  value,
  onChange,
  filter,
}: {
  value: number | undefined;
  onChange: (queue: number | undefined) => void;
  filter?: (queueId: number) => boolean;
}) {
  const [queues, setQueues] = useState<number[]>([]);
  const scopedQueue = useHistoryScopeQueue();
  const visibleQueues = filter ? queues.filter(filter) : queues;

  useEffect(() => {
    const fetchQueues = () =>
      window.api.getMatchFilterOptions({ queue: scopedQueue }).then((o) => setQueues(o.queues));
    fetchQueues();
    const unsub = window.api.onGamesUpdated(fetchQueues);
    return unsub;
  }, [scopedQueue]);

  // Clear the selection if new data leaves it without any matching games
  useEffect(() => {
    if (value !== undefined && visibleQueues.length > 0 && !visibleQueues.includes(value)) {
      onChange(undefined);
    }
  }, [visibleQueues, value, onChange]);

  if (visibleQueues.length < 2) return null;

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      className="select h-9 rounded-md border border-lol-border/60 bg-[#0c0e11] px-3 text-xs text-lol-text-bright scheme-dark transition-colors focus-visible:outline-none focus-visible:border-lol-gold/60 focus-visible:ring-1 focus-visible:ring-lol-gold/40"
    >
      <option value="" className="bg-[#0c0e11] text-lol-text-bright">
        All Queues
      </option>
      {visibleQueues.map((q) => (
        <option key={q} value={q} className="bg-[#0c0e11] text-lol-text-bright">
          {q === QUEUE_GROUP_ARENA ? "Arena" : queueLabel(q)}
        </option>
      ))}
    </select>
  );
}
