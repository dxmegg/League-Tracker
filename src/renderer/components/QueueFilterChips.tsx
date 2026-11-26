import {
  QUEUE_SCOPE_RANKED,
  QUEUE_SCOPE_NORMAL,
  QUEUE_SCOPE_ARENA,
  QUEUE_SCOPE_ARAM,
  QUEUE_SCOPE_MAYHEM,
} from "../../shared/queues";
import { useActiveMode } from "../hooks/useActiveMode";

const QUEUE_FILTERS: Array<{ label: string; value: number | undefined }> = [
  { label: "All", value: undefined },
  { label: "Ranked", value: QUEUE_SCOPE_RANKED },
  { label: "Normal", value: QUEUE_SCOPE_NORMAL },
  { label: "Arena", value: QUEUE_SCOPE_ARENA },
  { label: "ARAM", value: QUEUE_SCOPE_ARAM },
  { label: "Mayhem", value: QUEUE_SCOPE_MAYHEM },
];

export function QueueFilterChips({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (queue: number | undefined) => void;
}) {
  const [mode] = useActiveMode();
  // Mayhem mode pins the queue globally, so the per-page chips would be misleading.
  if (mode === "mayhem") return null;
  return (
    <div className="ml-auto flex items-center gap-2">
      {QUEUE_FILTERS.map((filter) => {
        const isActive = JSON.stringify(value ?? []) === JSON.stringify(filter.value ?? []);
        return (
          <button
            key={filter.label}
            type="button"
            onClick={() => onChange(filter.value)}
            className={`rounded-md border px-3 py-1 text-xs font-bold uppercase tracking-wider transition-colors ${
              isActive
                ? "border-lol-crimson/60 bg-lol-crimson/20 text-lol-text-bright"
                : "border-lol-border/50 bg-lol-card/40 text-lol-text hover:border-lol-crimson/60 hover:bg-lol-crimson/10 hover:text-lol-text-bright"
            }`}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}
