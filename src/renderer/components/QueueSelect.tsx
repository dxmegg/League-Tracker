import { useState, useEffect } from "react";
import {
  HIDDEN_QUEUE_IDS,
  isArenaQueue,
  QUEUE_GROUP_ARENA,
  QUEUE_LABELS,
} from "../../shared/queues";
import { FilterSelect } from "./FilterSelect";
import { useHistoryScopeQueue } from "../lib/historyScope";

export function queueLabel(queueId: number): string {
  if (isArenaQueue(queueId)) return "Arena";
  return QUEUE_LABELS[queueId] ?? `Queue ${queueId}`;
}

export default function QueueSelect({
  value,
  onChange,
  filter,
  className,
  variant,
}: {
  value: number | undefined;
  onChange: (queue: number | undefined) => void;
  filter?: (queueId: number) => boolean;
  className?: string;
  variant?: "default" | "segmented";
}) {
  const [queues, setQueues] = useState<number[]>([]);
  const scopedQueue = useHistoryScopeQueue();
  const visibleQueues = queues.filter(
    (queueId) => !HIDDEN_QUEUE_IDS.includes(queueId) && (!filter || filter(queueId)),
  );

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
    <FilterSelect
      value={value}
      onChange={(v) => onChange(v)}
      placeholder="All Queues"
      title="Queue"
      className={className}
      variant={variant}
      options={visibleQueues.map((q) => ({
        value: q,
        label: q === QUEUE_GROUP_ARENA ? "Arena" : queueLabel(q),
      }))}
    />
  );
}
