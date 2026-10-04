export function WeekdayBarChart({ days, counts }: { days: string[]; counts: number[] }) {
  if (days.length !== counts.length || days.length === 0) {
    return <div className="text-sm text-lol-text">No data</div>;
  }

  const hi = Math.max(...counts) || 1;

  return (
    <div className="wk">
      {days.map((day, i) => {
        const h = (counts[i] / hi) * 100;
        return (
          <div key={day} title={`${counts[i]} games`}>
            <i style={{ height: `${h}%` }} />
            <span>{day}</span>
          </div>
        );
      })}
    </div>
  );
}
