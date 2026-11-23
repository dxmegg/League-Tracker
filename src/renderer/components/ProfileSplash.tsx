import { useCallback, useEffect, useRef, useState } from "react";
import type { ChampionData } from "../../shared/api";
import { ChampionCombobox } from "./ChampionCombobox";

export type SplashPref = {
  // null keeps the automatic pick (most played champion)
  championId: number | null;
  skin: number;
  // background-position in %, and zoom in % of the header width
  x: number;
  y: number;
  zoom: number;
};

export const DEFAULT_SPLASH: SplashPref = { championId: null, skin: 0, x: 50, y: 22, zoom: 100 };

const SETTING_KEY = "profile_splash";

export const splashUrl = (key: string, skin: number): string =>
  `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${key}_${skin}.jpg`;

async function readAll(): Promise<Record<string, SplashPref>> {
  try {
    const raw = await window.api.getSetting(SETTING_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SplashPref>) : {};
  } catch {
    return {};
  }
}

// One saved look per account scope ("all" for the combined view), kept in a single setting.
export function useSplashPref(scope: string) {
  const [pref, setPref] = useState<SplashPref | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setPref(null);
    void readAll().then((all) => {
      if (!cancelled) setPref(all[scope] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const persist = useCallback(
    (next: SplashPref | null) => {
      window.clearTimeout(saveTimer.current);
      // Sliders fire continuously, so only the settled value is written
      saveTimer.current = window.setTimeout(() => {
        void readAll().then((all) => {
          if (next) all[scope] = next;
          else delete all[scope];
          void window.api.setSetting(SETTING_KEY, JSON.stringify(all));
        });
      }, 300);
    },
    [scope],
  );

  const update = useCallback(
    (patch: Partial<SplashPref>) => {
      setPref((prev) => {
        const next = { ...DEFAULT_SPLASH, ...prev, ...patch };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const reset = useCallback(() => {
    setPref(null);
    persist(null);
  }, [persist]);

  return { pref, update, reset };
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between font-display text-[11px] font-semibold text-lol-text">
        {label}
        <span className="tabular-nums text-lol-text-bright">{Math.round(value)}%</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-[var(--theme-crimson)]"
      />
    </label>
  );
}

export function SplashPicker({
  championId,
  pref,
  champData,
  onChange,
  onReset,
}: {
  // The champion currently on screen, picked or automatic
  championId: number | null;
  pref: SplashPref | null;
  champData: ChampionData;
  onChange: (patch: Partial<SplashPref>) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [skinNote, setSkinNote] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = { ...DEFAULT_SPLASH, ...pref };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Skin numbers are not contiguous per champion and the list is not bundled, so a step is probed first.
  const stepSkin = (dir: 1 | -1) => {
    const key = championId != null ? champData[championId]?.key : undefined;
    if (!key) return;
    const target = Math.max(0, current.skin + dir);
    if (target === current.skin) return;
    const probe = new Image();
    probe.onload = () => {
      setSkinNote(null);
      onChange({ skin: target, championId });
    };
    probe.onerror = () => {
      setSkinNote(dir === 1 ? "That was the last skin" : "No earlier skin");
      if (dir === 1) onChange({ skin: 0, championId });
    };
    probe.src = splashUrl(key, target);
  };

  return (
    <div ref={wrapRef} className="absolute right-3 top-3 z-30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Change header art"
        aria-expanded={open}
        className={`flex h-8 items-center gap-1.5 rounded-full border px-3 font-display text-[11.5px] font-semibold backdrop-blur transition-colors ${
          open
            ? "border-lol-crimson/60 bg-lol-crimson/25 text-lol-text-bright"
            : "border-white/15 bg-black/40 text-lol-text hover:text-lol-text-bright"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="m21 16-5-5-8 8" />
        </svg>
        Art
      </button>

      <div
        className={`absolute right-0 top-full mt-2 w-[310px] origin-top-right rounded-2xl border border-lol-crimson/30 bg-lol-card p-4 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.9)] transition-all duration-200 ${
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-1 scale-95 opacity-0"
        }`}
      >
        <div className="mb-3 font-display text-[11px] font-bold uppercase tracking-widest text-lol-text">
          Header art
        </div>

        <div className="mb-3">
          <ChampionCombobox
            value={championId}
            onChange={(id) => {
              if (id != null) {
                setSkinNote(null);
                onChange({ championId: id, skin: 0 });
              }
            }}
            placeholder="Pick a champion"
          />
        </div>

        <div className="mb-4 flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-1.5">
          <button
            type="button"
            onClick={() => stepSkin(-1)}
            className="px-2 text-lg leading-none text-lol-text transition-colors hover:text-lol-text-bright"
            aria-label="Previous skin"
          >
            ‹
          </button>
          <span className="font-display text-[12px] font-semibold text-lol-text-bright">
            {current.skin === 0 ? "Default skin" : `Skin ${current.skin}`}
          </span>
          <button
            type="button"
            onClick={() => stepSkin(1)}
            className="px-2 text-lg leading-none text-lol-text transition-colors hover:text-lol-text-bright"
            aria-label="Next skin"
          >
            ›
          </button>
        </div>
        {skinNote && <p className="-mt-2.5 mb-3 text-[11px] text-lol-text">{skinNote}</p>}

        <div className="space-y-3">
          <Slider
            label="Horizontal"
            value={current.x}
            min={0}
            max={100}
            onChange={(x) => onChange({ x, championId })}
          />
          <Slider
            label="Vertical"
            value={current.y}
            min={0}
            max={100}
            onChange={(y) => onChange({ y, championId })}
          />
          <Slider
            label="Zoom"
            value={current.zoom}
            min={100}
            max={300}
            onChange={(zoom) => onChange({ zoom, championId })}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            setSkinNote(null);
            onReset();
          }}
          className="mt-4 w-full rounded-lg border border-lol-border bg-white/[0.04] py-1.5 font-display text-[12px] font-semibold text-lol-text transition-colors hover:text-lol-text-bright"
        >
          Reset to automatic
        </button>
      </div>
    </div>
  );
}
