import type { SVGProps } from "react";
import { useActiveMode } from "../hooks/useActiveMode";
import { useShowAllMode } from "../hooks/useShowAllMode";
import type { DataMode } from "../lib/dataMode";
import { LayersIcon, SparklesIcon } from "./icons";
import icon from "../../../assets/icon.png";

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
  const [showAll] = useShowAllMode();

  return (
    <aside className="relative z-20 flex w-[76px] shrink-0 flex-col items-center gap-3 border-r border-lol-border/50 bg-black/35 py-4 backdrop-blur">
      <img src={icon} alt="" className="h-14 w-14 shrink-0" />

      <div className="mt-2 text-[9px] font-bold uppercase tracking-[0.24em] text-lol-text/50">
        Mode
      </div>

      {MODES.filter((m) => showAll || m.id === "mayhem").map(
        ({ id, label, title, Icon, primary }) => {
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
        },
      )}
    </aside>
  );
}
