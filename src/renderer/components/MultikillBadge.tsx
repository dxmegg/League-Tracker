interface MultikillBadgeProps {
  doubles: number;
  triples: number;
  quadras: number;
  pentas: number;
}

export default function MultikillBadge({ doubles, triples, quadras, pentas }: MultikillBadgeProps) {
  const badges: { label: string; count: number; color: string }[] = [];

  if (doubles > 0)
    badges.push({
      label: "DOUBLE",
      count: doubles,
      color: "bg-[#2c6fd1] text-white",
    });
  if (triples > 0)
    badges.push({
      label: "TRIPLE",
      count: triples,
      color: "bg-[#c98a2c] text-white",
    });
  if (quadras > 0)
    badges.push({
      label: "QUADRA",
      count: quadras,
      color: "bg-[#8548c9] text-white",
    });
  if (pentas > 0)
    badges.push({
      label: "PENTA",
      count: pentas,
      color: "bg-[#c9426b] text-white",
    });

  if (badges.length === 0) return null;

  return (
    <div className="flex gap-1 flex-wrap">
      {badges.map(({ label, count, color }) => (
        <span
          key={label}
          className={`text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap ${color}`}
        >
          {label}
          {count > 1 ? ` x${count}` : ""}
        </span>
      ))}
    </div>
  );
}
