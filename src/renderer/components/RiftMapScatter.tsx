import type { ChampionKillDeathPosition } from "../../shared/api";

interface RiftMapScatterProps {
  positions: ChampionKillDeathPosition[];
  width?: string | number;
  className?: string;
  mode?: "dots" | "heatmap";
}

const MAP_SIZE = 15_000;
const HEATMAP_GRID_SIZE = 20;

function mapCoordinate(value: number) {
  return Math.max(0, Math.min(100, (value / MAP_SIZE) * 100));
}

function getHeatmapCells(positions: ChampionKillDeathPosition[]) {
  const counts = new Map<string, number>();
  for (const position of positions) {
    const x = Math.min(
      HEATMAP_GRID_SIZE - 1,
      Math.max(0, Math.floor((mapCoordinate(position.x) / 100) * HEATMAP_GRID_SIZE)),
    );
    const y = Math.min(
      HEATMAP_GRID_SIZE - 1,
      Math.max(0, Math.floor(((100 - mapCoordinate(position.y)) / 100) * HEATMAP_GRID_SIZE)),
    );
    const key = `${x}-${y}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const maxCount = Math.max(...counts.values(), 0);
  return [...counts.entries()].map(([key, count]) => {
    const [x, y] = key.split("-").map(Number);
    return { x, y, count, opacity: maxCount > 0 ? (count / maxCount) * 0.7 : 0 };
  });
}

export default function RiftMapScatter({
  positions,
  width = "100%",
  className,
  mode = "dots",
}: RiftMapScatterProps) {
  const heatmapCells = mode === "heatmap" ? getHeatmapCells(positions) : [];
  return (
    <div className={className} style={{ width }}>
      <svg
        aria-label="Kill and death positions on Summoner's Rift"
        className="h-auto w-full"
        role="img"
        viewBox="0 0 100 100"
      >
        <rect x="1" y="1" width="98" height="98" fill="rgba(0, 0, 0, 0.08)" />
        {mode === "heatmap" &&
          heatmapCells.map((cell) => (
            <rect
              key={`${cell.x}-${cell.y}`}
              x={cell.x * 5}
              y={cell.y * 5}
              width="5"
              height="5"
              fill="var(--theme-crimson)"
              fillOpacity={cell.opacity}
            />
          ))}
        <line
          x1="5"
          y1="95"
          x2="95"
          y2="5"
          stroke="var(--theme-text)"
          strokeOpacity="0.2"
          strokeWidth="1"
        />
        {mode === "dots" &&
          positions.map((position, index) => (
            <circle
              key={`${position.kind}-${position.x}-${position.y}-${index}`}
              cx={mapCoordinate(position.x)}
              cy={100 - mapCoordinate(position.y)}
              fill={position.kind === "kill" ? "var(--theme-win)" : "var(--theme-loss)"}
              r="1.6"
            />
          ))}
        <rect
          x="1"
          y="1"
          width="98"
          height="98"
          fill="none"
          stroke="var(--theme-border)"
          strokeOpacity="0.6"
          strokeWidth="0.7"
        />
      </svg>
      {mode === "heatmap" ? (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-lol-text">
          <span>Sparse</span>
          <span className="h-2 w-24 rounded-sm bg-gradient-to-r from-lol-crimson/20 to-lol-crimson" />
          <span>Dense</span>
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-center gap-4 text-xs text-lol-text">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-lol-win" />
            Kills
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-lol-loss" />
            Deaths
          </span>
        </div>
      )}
    </div>
  );
}
