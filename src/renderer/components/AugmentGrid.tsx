import AugmentIcon from "./AugmentIcon";

export function parseAugmentIds(raw: string | null): number[] {
  if (!raw) return [];
  return raw.split(",").map(Number).filter(Boolean);
}

export function AugmentGrid({
  augmentIds,
  patch,
}: {
  augmentIds: number[];
  patch?: string | null;
}) {
  if (augmentIds.length === 0) return null;
  const cols = augmentIds.length <= 3 ? augmentIds.length : augmentIds.length === 4 ? 2 : 3;

  return (
    <div className="grid gap-1 shrink-0" style={{ gridTemplateColumns: `repeat(${cols}, 24px)` }}>
      {augmentIds.map((id, i) => (
        <div key={i} className="w-6 h-6 rounded-md border border-lol-gold/30 overflow-hidden">
          <AugmentIcon augmentId={id} size={24} patch={patch} />
        </div>
      ))}
    </div>
  );
}
