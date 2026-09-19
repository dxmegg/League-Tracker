import { useState, useEffect } from "react";
import { QUEUE_LABELS } from "../../shared/queues";
import { QUEUE_GROUP_ARENA } from "../../shared/queues";
import { FilterSelect } from "./FilterSelect";
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
    <FilterSelect
      value={value}
      onChange={(v) => onChange(v)}
      placeholder="All Queues"
      title="Queue"
      options={visibleQueues.map((q) => ({
        value: q,
        label: q === QUEUE_GROUP_ARENA ? "Arena" : queueLabel(q),
      }))}
    />
  );
}
