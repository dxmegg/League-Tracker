/// <reference types="vite/client" />
import changelog from "../../../CHANGELOG.md?raw";
import { useIpc } from "../hooks/useIpc";
import { Title } from "./live/shared";

// Bundled with the build, so it matches the running version and works offline.
// CHANGELOG.md only uses "## version" headings and "- " bullets.
const RELEASES = changelog
  .replaceAll("`", "")
  .split(/^## /m)
  .slice(1)
  .map((block) => {
    const [title, ...lines] = block.split(/\r?\n/);
    return { title, changes: lines.filter((l) => l.startsWith("- ")).map((l) => l.slice(2)) };
  });

export function ChangelogSection() {
  const { data: version } = useIpc(() => window.api.getVersion(), []);

  return (
    <section className="app-tile min-w-0 lg:col-span-2">
      <Title>What&apos;s new</Title>
      <div className="flex flex-col gap-2">
        {RELEASES.map(({ title, changes }, index) => (
          <details
            key={title}
            open={index === 0}
            className="rounded-xl border border-lol-border/50 bg-black/25 open:border-lol-crimson/40"
          >
            <summary className="cursor-pointer rounded-xl px-3 py-2.5 font-display text-[14px] font-bold text-lol-text-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60">
              {title}
              {version && title.split(" ")[0] === version && (
                <span className="ml-2 text-[11px] font-semibold text-lol-gold">installed</span>
              )}
            </summary>
            <ul className="list-disc space-y-1 border-t border-lol-border/30 py-3 pl-8 pr-3 text-[12.5px] leading-relaxed text-lol-text">
              {changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
