import { useViewState } from "../hooks/useViewState";
// The League client's own challenges. Read from the client; the last answer is kept so the page
// still works while the client is closed.
import { useEffect, useState } from "react";
import type { ChallengesData } from "../../shared/api";
import { useIpc } from "../hooks/useIpc";
import { useLcuStatus } from "../hooks/useLcuStatus";
import { formatNumber, formatTimeAgo } from "../lib/format";
import { FilterChip } from "../components/FilterChip";
import { SearchInput } from "../components/SearchInput";
import { TIERS } from "../lib/achievements";

const PAGE_SIZE = 60;
const SORTS = ["Closest to next tier", "Highest tier", "Name"] as const;
const KINDS = ["Any tiers", "Single tier", "Tiered"] as const;

const tierIndex = (level: string) => TIERS.findIndex((t) => t.name.toUpperCase() === level);
const title = (text: string) => text.charAt(0) + text.slice(1).toLowerCase();

export default function Challenges() {
  const status = useLcuStatus();
  const { data, loading, refetch } = useIpc<ChallengesData>(
    () => window.api.getChallenges(),
    [status === "disconnected"],
  );
  const [category, setCategory] = useViewState("challenges.category", "All");
  const [sort, setSort] = useViewState<(typeof SORTS)[number]>(
    "challenges.sort",
    "Closest to next tier",
  );
  const [search, setSearch] = useViewState("challenges.search", "");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("Any tiers");
  const [visible, setVisible] = useState(PAGE_SIZE);
  useEffect(() => setVisible(PAGE_SIZE), [category, kind, sort, search]);

  const challenges = data?.challenges ?? [];
  const categories = ["All", ...[...new Set(challenges.map((c) => c.category))].sort()];
  // -1 for finished challenges, so they sort after everything still in progress
  const fraction = (c: (typeof challenges)[number]) => {
    if (c.nextThreshold == null) return -1;
    const [done, goal] = c.reverse ? [c.nextThreshold, c.value] : [c.value, c.nextThreshold];
    return goal > 0 ? Math.min(1, done / goal) : 0;
  };
  const query = search.trim().toLowerCase();
  const shown = challenges
    .filter(
      (c) =>
        (category === "All" || c.category === category) &&
        (kind === "Any tiers" || (c.tiers.length === 1) === (kind === "Single tier")) &&
        `${c.name} ${c.description}`.toLowerCase().includes(query),
    )
    .sort((a, b) =>
      sort === "Name"
        ? a.name.localeCompare(b.name)
        : sort === "Highest tier"
          ? tierIndex(b.level) - tierIndex(a.level) || a.name.localeCompare(b.name)
          : fraction(b) - fraction(a),
    );

  return (
    <div className="flex min-h-full w-full flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-bold leading-none text-lol-text-bright">
            Challenges
          </h1>
          <p className="mt-2 text-[13px] text-lol-text">
            {data?.totalLevel
              ? `${title(data.totalLevel)} crystal · ${formatNumber(data.totalPoints)} points · `
              : ""}
            {data?.fetchedAt
              ? `${data.live ? "read from the client" : "saved copy from"} ${formatTimeAgo(data.fetchedAt)}`
              : "League of Legends challenges, read from the client"}
          </p>
        </div>
        <FilterChip onClick={refetch} className="h-9 px-4">
          Refresh
        </FilterChip>
      </div>

      {loading && !data ? (
        <div className="py-10 text-center text-sm text-lol-text">Loading…</div>
      ) : challenges.length === 0 ? (
        <div className="app-tile py-10 text-center text-sm text-lol-text">
          {data?.error ?? "Start the League of Legends client and sign in to load your challenges."}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {categories.map((value) => (
              <FilterChip
                key={value}
                active={category === value}
                onClick={() => setCategory(value)}
              >
                {title(value)}
              </FilterChip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {KINDS.map((value) => (
              <FilterChip key={value} active={kind === value} onClick={() => setKind(value)}>
                {value}
              </FilterChip>
            ))}
            <span className="mx-2 h-5 w-px bg-lol-border" aria-hidden="true" />
            {SORTS.map((value) => (
              <FilterChip key={value} active={sort === value} onClick={() => setSort(value)}>
                {value}
              </FilterChip>
            ))}
            <span className="ml-auto text-xs text-lol-text">
              {formatNumber(shown.length)} challenges
            </span>
            <SearchInput
              className="w-56"
              placeholder="Search challenges"
              aria-label="Search challenges"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
            {shown.slice(0, visible).map((c) => {
              const tier = tierIndex(c.level);
              const single = c.tiers.length === 1;
              const complete = c.nextThreshold == null;
              // A one-tier challenge wears that tier's colour, earned or not
              const shownTier = single ? tierIndex(c.tiers[0].level) : tier;
              const color = shownTier < 0 ? "#64748b" : TIERS[shownTier].color;
              return (
                <div
                  key={c.id}
                  className="app-tile flex min-w-0 flex-col gap-2 !p-4"
                  style={{ borderLeft: `3px solid ${tier < 0 ? "#64748b" : TIERS[tier].color}` }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-display text-[15px] font-bold text-lol-text-bright">
                      {c.name}
                    </span>
                    <span className="shrink-0 text-[11px] font-bold uppercase" style={{ color }}>
                      {single && shownTier >= 0
                        ? `${TIERS[shownTier].name} only`
                        : tier < 0
                          ? "Unranked"
                          : TIERS[tier].name}
                    </span>
                  </div>
                  <div className="flex-1 text-[12px] text-lol-text">{c.description}</div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${complete ? 100 : fraction(c) * 100}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] tabular-nums text-lol-text">
                    <span>
                      {complete
                        ? single
                          ? "Earned"
                          : `${formatNumber(c.value)} · complete`
                        : c.reverse
                          ? `${formatNumber(c.value)} · next at ${formatNumber(c.nextThreshold!)} or lower`
                          : `${formatNumber(c.value)} / ${formatNumber(c.nextThreshold!)}`}
                    </span>
                    {c.percentile != null && <span>top {c.percentile.toFixed(1)}% of players</span>}
                  </div>
                  {!single && (
                    <div className="flex gap-1">
                      {c.tiers.map((step) => {
                        const index = tierIndex(step.level);
                        return (
                          <span
                            key={step.level}
                            title={`${title(step.level)}: ${formatNumber(step.value)}`}
                            className="h-1.5 flex-1 rounded-sm"
                            style={{
                              backgroundColor: TIERS[index]?.color ?? "#64748b",
                              opacity: index <= tier ? 1 : 0.2,
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {shown.length > visible && (
            <FilterChip onClick={() => setVisible((n) => n + PAGE_SIZE)} className="h-9">
              Show more ({formatNumber(shown.length - visible)} left)
            </FilterChip>
          )}
        </>
      )}
    </div>
  );
}
