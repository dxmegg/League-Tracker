/// <reference types="vite/client" />
import { useState } from "react";
import changelog from "../../../CHANGELOG.md?raw";
import { useIpc } from "../hooks/useIpc";
import { Title } from "./live/shared";

type Kind = "new" | "fixed" | "improved";

const KINDS: Record<Kind, { label: string; className: string }> = {
  new: { label: "New", className: "border-lol-crimson/50 bg-lol-crimson/15 text-lol-text-bright" },
  fixed: { label: "Fixed", className: "border-lol-win/40 bg-lol-win/10 text-lol-win" },
  improved: { label: "Improved", className: "border-lol-gold/40 bg-lol-gold/10 text-lol-gold" },
};

// The kind is read from the wording, so CHANGELOG.md stays plain "- " bullets
function kindOf(change: string): Kind {
  if (/^(new|added?|first)\b/i.test(change)) return "new";
  if (/\bfix(es|ed)?\b/i.test(change)) return "fixed";
  if (
    /^(bigger|faster|smaller|better|moved?|unified|the)\b|\b(re[a-z]+ed|rewritten|refactor|rebuilt|applied)\b/i.test(
      change,
    )
  )
    return "improved";
  // Most remaining bullets name a feature, e.g. "Live Game tab: ..."
  return "new";
}

// shortcut: self-check runs on import in dev only; move to a test file if the rules grow
if (import.meta.env.DEV) {
  console.assert(kindOf("Fixed two-part tags") === "fixed", "changelog kind: fixed");
  console.assert(kindOf("Rebuilt Settings") === "improved", "changelog kind: improved");
  console.assert(kindOf("Live Game tab: scoreboard") === "new", "changelog kind: new");
}

// Bundled with the build, so it matches the running version and works offline.
// CHANGELOG.md only uses "## version (yyyy-mm-dd)" headings and "- " bullets.
// A block without a date is not released yet and is never shown.
const RELEASES = changelog
  .replaceAll("`", "")
  .split(/^## /m)
  .slice(1)
  .map((block) => {
    const [title, ...lines] = block.split(/\r?\n/);
    const [, version = "", date = ""] = title.match(/^(\S+)\s+\((\d{4}-\d{2}-\d{2})\)/) ?? [];
    const changes = lines
      .filter((l) => l.startsWith("- "))
      .map((l) => ({ text: l.slice(2), kind: kindOf(l.slice(2)) }));
    return { version, date, changes };
  })
  .filter((release) => release.date);

const SHOWN_AT_FIRST = 3;
const TOTAL_CHANGES = RELEASES.reduce((sum, r) => sum + r.changes.length, 0);

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Release({
  release,
  latest,
  installed,
}: {
  release: (typeof RELEASES)[number];
  latest: boolean;
  installed: boolean;
}) {
  const counts = (Object.keys(KINDS) as Kind[])
    .map((kind) => ({ kind, n: release.changes.filter((c) => c.kind === kind).length }))
    .filter(({ n }) => n > 0);

  return (
    <li className="relative pb-5 pl-8 last:pb-0">
      {/* Timeline dot; the line itself is the list's left border */}
      <span
        aria-hidden="true"
        className={`absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 ${
          latest ? "border-lol-crimson bg-lol-crimson" : "border-lol-border bg-[var(--theme-card)]"
        }`}
      />
      <div
        className={`rounded-xl border p-4 ${
          latest
            ? "border-lol-crimson/45 bg-lol-crimson/[0.07]"
            : "border-lol-border/50 bg-black/20"
        }`}
      >
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3
            className={`font-display font-bold text-lol-text-bright ${latest ? "text-[22px]" : "text-[17px]"}`}
          >
            v{release.version}
          </h3>
          <span className="text-[12px] text-lol-text">{formatDate(release.date)}</span>
          {latest && (
            <span className="rounded-full bg-lol-crimson px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-white">
              Latest
            </span>
          )}
          {installed && (
            <span className="rounded-full border border-lol-gold/50 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-lol-gold">
              Installed
            </span>
          )}
          <span className="ml-auto flex gap-1.5">
            {counts.map(({ kind, n }) => (
              <span
                key={kind}
                className={`rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums ${KINDS[kind].className}`}
              >
                {n} {KINDS[kind].label.toLowerCase()}
              </span>
            ))}
          </span>
        </div>
        <ul className="space-y-2">
          {release.changes.map(({ text, kind }) => (
            <li key={text} className="flex items-start gap-3">
              <span
                className={`mt-px w-[68px] shrink-0 rounded-md border py-0.5 text-center text-[10px] font-bold uppercase tracking-wider ${KINDS[kind].className}`}
              >
                {KINDS[kind].label}
              </span>
              <span
                className={`leading-relaxed ${latest ? "text-[13.5px] text-lol-text-bright" : "text-[12.5px] text-lol-text"}`}
              >
                {text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export function ChangelogSection() {
  const { data: version } = useIpc(() => window.api.getVersion(), []);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? RELEASES : RELEASES.slice(0, SHOWN_AT_FIRST);

  return (
    <section className="app-tile min-w-0 lg:col-span-2">
      <Title
        aside={
          <span className="text-[12px] text-lol-text">
            {RELEASES.length} releases · {TOTAL_CHANGES} changes
          </span>
        }
      >
        What&apos;s new
      </Title>
      <ol className="ml-1.5 border-l-2 border-lol-border/40">
        {shown.map((release) => (
          <Release
            key={release.version}
            release={release}
            latest={release === RELEASES[0]}
            installed={!!version && release.version === version}
          />
        ))}
      </ol>
      {RELEASES.length > SHOWN_AT_FIRST && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="mt-4 h-9 w-full rounded-lg border border-lol-border/60 text-[12px] font-bold uppercase tracking-wider text-lol-text transition-colors hover:border-lol-crimson/50 hover:text-lol-text-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60"
        >
          {showAll
            ? "Show fewer releases"
            : `Show ${RELEASES.length - SHOWN_AT_FIRST} older releases`}
        </button>
      )}
    </section>
  );
}
