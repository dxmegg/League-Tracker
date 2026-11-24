import { useEffect, useState, type ReactNode } from "react";
import type { LivePlayer, LiveSpell } from "../../../shared/api";
import {
  findChampionIdByName,
  getChampionDataVersion,
  useChampionData,
  useRuneData,
  useSummonerSpellData,
} from "../../hooks/useChampions";
import { STAT_ITEM_ICONS, spellIdByName, statIconUrl } from "../../lib/live";
import ChampionIcon from "../ChampionIcon";
import RuneIcon from "../RuneIcon";
import SummonerSpellIcon from "../SummonerSpellIcon";

// Ally and enemy get fixed colors everywhere on the tab, whichever side of the map they spawned on.
export const SIDE = {
  ally: {
    text: "text-lol-assist",
    bg: "bg-lol-assist",
    ring: "ring-lol-assist/60",
    var: "var(--color-lol-assist)",
  },
  enemy: {
    text: "text-lol-loss",
    bg: "bg-lol-loss",
    ring: "ring-lol-loss/60",
    var: "var(--color-lol-loss)",
  },
} as const;

export function useLiveResolvers() {
  const champData = useChampionData();
  const runeData = useRuneData();
  const spells = useSummonerSpellData();
  return {
    champData,
    runeData,
    championId: (p: Pick<LivePlayer, "championId" | "championName">): number | null =>
      p.championId ?? findChampionIdByName(champData, p.championName),
    spellId: (s: LiveSpell): number | null => s.id ?? spellIdByName(spells, s.name),
  };
}

export function Title({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex h-8 flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-[12px] font-bold uppercase tracking-widest text-lol-gold">
        <i className="block h-3.5 w-[3px] rounded-full bg-lol-crimson" aria-hidden="true" />
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function Meter({
  value,
  max,
  className,
  label,
}: {
  value: number;
  max: number;
  className: string;
  label?: ReactNode;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="relative h-4 overflow-hidden rounded-full bg-black/35 ring-1 ring-lol-border/40">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${className}`}
        style={{ width: `${pct}%` }}
      />
      {label && (
        <span className="absolute inset-0 flex items-center justify-center font-display text-[10.5px] font-semibold tabular-nums text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
          {label}
        </span>
      )}
    </div>
  );
}

function InitialsBadge({ label }: { label: string }) {
  const initials = label
    .split(/[\s/&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md bg-white/10 font-display text-[8.5px] font-bold text-lol-text-bright"
    >
      {initials}
    </span>
  );
}

// A representative item's icon, cached through the main process like every other dragon asset
function StatItemIcon({ itemId, label }: { itemId: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const version = await getChampionDataVersion();
      if (!version || version === "none") return;
      const cached = await window.api.cacheDragonAsset(
        `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`,
      );
      if (!cancelled && cached) setSrc(cached);
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId]);
  if (!src) return <InitialsBadge label={label} />;
  return (
    <img
      src={src}
      alt=""
      width={18}
      height={18}
      className="h-[18px] w-[18px] shrink-0 rounded-[4px]"
    />
  );
}

// The game's own art where it has some, then a stand-in item icon, then a badge with the stat's initials
export function StatIcon({ iconKey, label }: { iconKey?: string; label: string }) {
  const [failed, setFailed] = useState(false);
  const url = statIconUrl(iconKey);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        width={18}
        height={18}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-[18px] w-[18px] shrink-0"
      />
    );
  }
  const itemId = iconKey ? STAT_ITEM_ICONS[iconKey] : undefined;
  return itemId ? <StatItemIcon itemId={itemId} label={label} /> : <InitialsBadge label={label} />;
}

export function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-display text-[10.5px] font-bold uppercase tracking-wider ${className}`}
    >
      {children}
    </span>
  );
}

export function SpellPair({ player }: { player: Pick<LivePlayer, "spellOne" | "spellTwo"> }) {
  const { spellId } = useLiveResolvers();
  return (
    <div className="flex gap-1">
      {[player.spellOne, player.spellTwo].map((s, i) => {
        const id = spellId(s);
        return (
          <span
            key={i}
            title={s.name || "Unknown spell"}
            className="flex h-[22px] w-[22px] items-center justify-center overflow-hidden rounded-md border border-lol-border/60 bg-black/30"
          >
            {id ? (
              <SummonerSpellIcon spellId={id} size={22} className="rounded-md" />
            ) : (
              <span className="text-[9px] font-bold text-lol-text">
                {s.name.slice(0, 2).toUpperCase() || "?"}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function RuneChip({
  rune,
  size = 22,
}: {
  rune: { id: number; name: string } | null;
  size?: number;
}) {
  const { runeData } = useLiveResolvers();
  if (!rune) return <span className="inline-block" style={{ width: size, height: size }} />;
  return (
    <span title={rune.name || `Rune ${rune.id}`} className="inline-flex shrink-0">
      <RuneIcon runeId={rune.id} path={runeData[rune.id]?.icon} size={size} />
    </span>
  );
}

export function Who({
  player,
  fallback,
  ally,
  size = 20,
}: {
  player: LivePlayer | undefined;
  fallback: string;
  ally: boolean | null;
  size?: number;
}) {
  const { championId } = useLiveResolvers();
  const id = player ? championId(player) : null;
  const tone = ally == null ? "text-lol-text-bright" : ally ? SIDE.ally.text : SIDE.enemy.text;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {id != null && <ChampionIcon championId={id} size={size} className="rounded-md" />}
      <span className={`font-display text-[13px] font-semibold ${tone}`}>
        {player ? player.gameName || player.summonerName : fallback}
      </span>
    </span>
  );
}
