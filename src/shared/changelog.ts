// The changelog files only use "## version (yyyy-mm-dd)" headings and "- " bullets.
// A block without a date is not released yet and is never shown.
export function parseChangelog(text: string) {
  return text
    .replaceAll("`", "")
    .split(/^## /m)
    .slice(1)
    .map((block) => {
      const [title, ...lines] = block.split(/\r?\n/);
      const [, version = "", date = ""] = title.match(/^(\S+)\s+\((\d{4}-\d{2}-\d{2})\)/) ?? [];
      return {
        version,
        date,
        changes: lines.filter((l) => l.startsWith("- ")).map((l) => l.slice(2)),
      };
    })
    .filter((release) => release.date);
}
