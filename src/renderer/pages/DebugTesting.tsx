import { Card, CardContent } from "@/components/ui/card";

// Fixed violet (not theme-tinted) so the cards stay purple in every mode. The slow transition on
// hover leaves the glow fading out behind the cursor (the "afterglow").
const GLOW_CARD =
  "rounded-2xl border border-violet-500/30 p-6 " +
  "bg-[radial-gradient(circle_at_top_right,rgb(139_92_246/0.14),transparent_55%),linear-gradient(160deg,rgb(46_16_101/0.45),var(--theme-card)_70%)] " +
  "shadow-[inset_0_1px_0_0_rgb(196_181_253/0.06),0_0_24px_-10px_rgb(139_92_246/0.35)] " +
  "transition-[box-shadow,border-color] duration-700 ease-out " +
  "hover:border-violet-400/55 hover:shadow-[inset_0_1px_0_0_rgb(196_181_253/0.1),0_0_28px_-6px_rgb(139_92_246/0.5)] " +
  "hover:duration-150";

export default function DebugTesting() {
  return (
    <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-2">
      {[1, 2, 3, 4].map((n) => (
        <Card key={n} className={GLOW_CARD}>
          <CardContent className="font-display text-[22px] font-bold text-lol-text-bright">
            test
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
