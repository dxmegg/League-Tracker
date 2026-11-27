import { useEffect, useRef, useState } from "react";
import { useUpdater } from "../hooks/useUpdater";
import { DownloadIcon } from "./icons";
import { UpdatePanel } from "./UpdatePanel";

// Top-bar button that opens the update window; the dot says a newer version is waiting
export function UpdateButton() {
  const { status, info } = useUpdater();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const label = info?.hasUpdate ? `Update ${info.latest} available` : "Updates";

  // An automatic update starts on its own, so show its progress without being asked
  useEffect(() => {
    if (status === "updating") setOpen(true);
  }, [status]);

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

  return (
    <div ref={wrapRef} className="titlebar-no-drag relative">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`group relative flex h-8 w-8 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60 ${
          open
            ? "border-lol-crimson/60 bg-lol-crimson/20 text-lol-text-bright"
            : "border-lol-border/60 bg-lol-card/60 text-lol-text hover:border-lol-crimson/40 hover:text-lol-text-bright"
        }`}
      >
        <DownloadIcon className="h-4 w-4" />
        {info?.hasUpdate && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-lol-win" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[440px] rounded-2xl border border-lol-border bg-[var(--theme-card)] p-4 text-left shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9)]">
          <UpdatePanel />
        </div>
      )}
    </div>
  );
}
