import { useEffect, useRef, useState } from "react";
import { useActiveTheme } from "../hooks/useActiveTheme";
import { ArrowDownIcon } from "./icons";
import { THEME_OPTIONS } from "../lib/themes";

// Developer-mode theme switcher for the top bar; the choice lasts until the program closes.
export function ThemeMenu() {
  const active = useActiveTheme({ exact: true }) || "redesign";
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (value: string) => {
    document.documentElement.setAttribute("data-theme", value);
    setOpen(false);
  };

  const label = THEME_OPTIONS.find((o) => o.value === active)?.label ?? "Theme";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        title="Theme"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-9 items-center gap-2 rounded-full border px-3 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60 ${
          open
            ? "border-lol-crimson/60 bg-lol-crimson/15 text-lol-text-bright"
            : "border-lol-border/60 bg-lol-card/60 text-lol-text hover:border-lol-crimson/40 hover:text-lol-text-bright"
        }`}
      >
        <i className="h-2.5 w-2.5 rounded-full bg-lol-crimson shadow-[0_0_8px_var(--theme-crimson-glow)]" />
        <span className="hidden lg:inline">{label}</span>
        <ArrowDownIcon
          className={`h-3 w-3 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        role="listbox"
        aria-hidden={!open}
        className={`absolute right-0 top-full z-50 mt-2 w-[190px] origin-top-right transition-all duration-200 ease-out ${
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-1 scale-95 opacity-0"
        }`}
      >
        <div className="rounded-xl border border-lol-crimson/30 bg-lol-card bg-[linear-gradient(160deg,var(--theme-card-hover),var(--theme-card))] p-1.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9),0_0_24px_-8px_var(--theme-crimson-glow)]">
          {THEME_OPTIONS.map((o) => {
            const on = o.value === active;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                tabIndex={open ? 0 : -1}
                onClick={() => pick(o.value)}
                className={`flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-150 ${
                  on
                    ? "bg-lol-crimson/20 text-lol-text-bright shadow-[inset_2px_0_0_var(--theme-crimson)]"
                    : "text-lol-text hover:bg-white/[0.07] hover:text-lol-text-bright"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
