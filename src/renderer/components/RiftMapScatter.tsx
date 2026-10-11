import type { ChampionKillDeathPosition } from "../../shared/api";

interface RiftMapScatterProps {
  positions: ChampionKillDeathPosition[];
  width?: string | number;
  className?: string;
}

const MAP_SIZE = 15_000;

function mapCoordinate(value: number) {
  return Math.max(0, Math.min(100, (value / MAP_SIZE) * 100));
}

export default function RiftMapScatter({
  positions,
  width = "100%",
  className,
}: RiftMapScatterProps) {
  return (
    <div className={className} style={{ width }}>
      <svg
        aria-label="Kill and death positions on Summoner's Rift"
        className="h-auto w-full"
        role="img"
        viewBox="0 0 100 100"
      >
        <rect
          x="1"
          y="1"
          width="98"
          height="98"
          fill="rgba(0, 0, 0, 0.08)"
          stroke="var(--theme-border)"
          strokeOpacity="0.6"
          strokeWidth="0.7"
        />
        <line
          x1="5"
          y1="95"
          x2="95"
          y2="5"
          stroke="var(--theme-text)"
          strokeOpacity="0.2"
          strokeWidth="1"
        />
        {positions.map((position, index) => (
          <circle
            key={`${position.kind}-${position.x}-${position.y}-${index}`}
            cx={mapCoordinate(position.x)}
            cy={100 - mapCoordinate(position.y)}
            fill={position.kind === "kill" ? "var(--theme-win)" : "var(--theme-loss)"}
            r="1.6"
          />
        ))}
      </svg>
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
    </div>
  );
}
