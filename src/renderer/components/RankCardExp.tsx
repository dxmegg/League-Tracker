import type { ProfileRankedEntry } from "../../shared/api";
import { formatNumber } from "../lib/format";

const RANKED_EMBLEM_BASE_URL =
  "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/images";
const RANK_TIERS = new Set([
  "iron",
  "bronze",
  "silver",
  "gold",
  "platinum",
  "emerald",
  "diamond",
  "master",
  "grandmaster",
  "challenger",
  "unranked",
]);

function normalizeEmblemTier(tier: string | null | undefined): string {
  const baseTier = (tier ?? "")
    .trim()
    .toLowerCase()
    .split(/[_\s-]+/, 1)[0];
  return RANK_TIERS.has(baseTier) ? baseTier : "unranked";
}

export function RankCardExp({ title, entry }: { title: string; entry: ProfileRankedEntry | null }) {
  const emblemTier = normalizeEmblemTier(entry?.tier);
  const unranked = !entry || !entry.tier || emblemTier === "unranked";
  const fallbackEmblemUrl = `${RANKED_EMBLEM_BASE_URL}/unranked.png`;

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-lol-border bg-[linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-5">
      <img
        src={`${RANKED_EMBLEM_BASE_URL}/${emblemTier}.png`}
        alt={unranked ? "Unranked emblem" : `${entry.tier} ${entry.rank} emblem`}
        className="h-16 w-16 shrink-0 object-contain"
        onError={(event) => {
          if (event.currentTarget.src !== fallbackEmblemUrl) {
            event.currentTarget.src = fallbackEmblemUrl;
          }
        }}
      />
      <div className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-medium uppercase tracking-wider text-lol-text/60">
          {title}
        </span>
        <b className="block font-display text-[20px] font-semibold text-lol-text-bright">
          {unranked ? "Unranked" : `${entry.tier} ${entry.rank ?? ""}`}
        </b>
        <span className="text-[13px] text-lol-text">
          {unranked
            ? "Your rank appears here once you play ranked."
            : `${entry.leaguePoints ?? 0} LP · ${formatNumber(entry.wins ?? 0)}W ${formatNumber(entry.losses ?? 0)}L`}
        </span>
      </div>
    </div>
  );
}
