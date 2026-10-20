import type { TrendsData } from "../lib/types";
import { clockPoint, TimeSeriesChart } from "./TimeSeriesChart";

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function WeekdayChart({ weekdays }: { weekdays: TrendsData["weekdays"] }) {
  const byDay = new Map(weekdays.map((w) => [w.weekday, w]));
  const points = WEEKDAY_ORDER.map((dow) =>
    clockPoint(
      WEEKDAY_LABELS[dow],
      WEEKDAY_FULL[dow],
      byDay.get(dow)?.games ?? 0,
      byDay.get(dow)?.wins ?? 0,
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
