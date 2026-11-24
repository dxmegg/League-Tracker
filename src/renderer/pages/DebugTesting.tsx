import { Card, CardContent } from "@/components/ui/card";

// Tinted by --theme-crimson, which is the violet accent in Mayhem mode. The slow transition on
// hover leaves the glow fading out behind the cursor (the "afterglow").
const GLOW_CARD =
  "rounded-2xl border border-lol-crimson/50 p-6 " +
  "bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_22%,transparent),transparent_60%),linear-gradient(160deg,color-mix(in_oklab,var(--theme-crimson)_10%,var(--theme-card-hover)),var(--theme-card))] " +
  "shadow-[inset_0_0_14px_-4px_var(--theme-crimson-glow),0_0_14px_-2px_var(--theme-crimson-glow),0_0_42px_-8px_var(--theme-crimson-glow)] " +
  "transition-[box-shadow,border-color] duration-700 ease-out " +
  "hover:border-lol-crimson-bright/80 hover:shadow-[inset_0_0_22px_-4px_var(--theme-crimson-glow),0_0_22px_0_var(--theme-crimson-glow),0_0_64px_-4px_var(--theme-crimson-glow)] " +
  "hover:duration-150";

export default function DebugTesting() {
  return (
    <div className="mx-auto grid w-full max-w-[1320px] grid-cols-1 gap-5 md:grid-cols-2">
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
