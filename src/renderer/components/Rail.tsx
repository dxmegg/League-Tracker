import type { SVGProps } from "react";
import { useActiveMode } from "../hooks/useActiveMode";
import type { DataMode } from "../lib/dataMode";
import { LayersIcon, SparklesIcon } from "./icons";

type RailIcon = (props: SVGProps<SVGSVGElement>) => React.JSX.Element;

// Mayhem is the primary mode and sits on top; "All" is the secondary, wider scope below it.
const MODES: Array<{
  id: DataMode;
  label: string;
  title: string;
  Icon: RailIcon;
  primary: boolean;
}> = [
  { id: "mayhem", label: "MAYHEM", title: "ARAM Mayhem only", Icon: SparklesIcon, primary: true },
  {
    id: "all",
    label: "ALL",
    title: "All matches: every saved queue",
    Icon: LayersIcon,
    primary: false,
  },
];

// Global data-scope switch: the whole app reads from whichever mode is lit here.
export function Rail() {
  const [mode, setMode] = useActiveMode();

  return (
    <aside className="relative z-20 flex w-[76px] shrink-0 flex-col items-center gap-3 border-r border-lol-border/50 bg-black/35 py-4 backdrop-blur">
      <svg
        aria-hidden="true"
        className="h-9 w-9 shrink-0 text-lol-crimson drop-shadow-[0_0_10px_var(--theme-crimson-glow)]"
        viewBox="0 0 36 36"
        fill="none"
      >
        <path d="M18 2 32 10v16L18 34 4 26V10L18 2Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="m18 9 8 5v8l-8 5-8-5v-8l8-5Z" fill="currentColor" />
      </svg>

      <div className="mt-2 text-[9px] font-bold uppercase tracking-[0.24em] text-lol-text/50">
        Mode
      </div>

      {MODES.map(({ id, label, title, Icon, primary }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            title={title}
            aria-pressed={active}
            onClick={() => setMode(id)}
            className={`group relative flex w-[58px] flex-col items-center justify-center gap-1.5 rounded-2xl border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60 ${
              primary ? "h-[74px]" : "h-[58px]"
            } ${
              active
                ? "border-white/15 bg-gradient-to-br from-lol-crimson to-lol-crimson-bright text-white shadow-[0_0_28px_var(--theme-crimson-glow)]"
                : "border-lol-border/60 bg-lol-card/50 text-lol-text hover:border-lol-crimson/50 hover:text-lol-text-bright"
            }`}
          >
            <Icon className={primary ? "h-[22px] w-[22px]" : "h-[17px] w-[17px]"} />
            <span className="text-[9px] font-extrabold leading-none tracking-tight">{label}</span>
            {primary && (
              <span
                className={`absolute -right-1 -top-1 rounded-full border px-1.5 py-px text-[7px] font-extrabold tracking-wider ${
                  active
                    ? "border-white/30 bg-white text-lol-crimson"
                    : "border-lol-crimson/50 bg-lol-card text-lol-crimson"
                }`}
              >
                MAIN
              </span>
            )}
          </button>
        );
      })}
    </aside>
  );
}
