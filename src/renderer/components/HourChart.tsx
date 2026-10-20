import type { TrendsData } from "../lib/types";
import { clockPoint, TimeSeriesChart } from "./TimeSeriesChart";

export function HourChart({ hours }: { hours: TrendsData["hours"] }) {
  const byHour = new Map(hours.map((h) => [h.hour, h]));
  const points = Array.from({ length: 24 }, (_, hour) =>
    clockPoint(
      `${hour}:00`,
      `${String(hour).padStart(2, "0")}:00 – ${String((hour + 1) % 24).padStart(2, "0")}:00`,
      byHour.get(hour)?.games ?? 0,
      byHour.get(hour)?.wins ?? 0,
    ),
  );
  return (
    <TimeSeriesChart
      points={points}
      yMin={0}
      yMax={100}
      ticks={[0, 25, 50, 75, 100]}
      refValue={50}
      format={(v) => `${Math.round(v)}%`}
      height={180}
    />
  );
}
