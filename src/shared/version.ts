// The one place that names where releases and updates come from
export const REPOSITORY = "dxmegg/Rift-Records";
export const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;

// "v1.1", "v.1.1.0" and "1.1.0" name the same release; any other tag is taken as written
function releaseName(tag: string): string {
  return tag
    .trim()
    .replace(/^v\.?/, "")
    .replace(/^(\d+\.\d+)$/, "$1.0");
}

// Versions are never ordered: the newest release is the one published last, whatever its number
export function isSameRelease(a: string, b: string): boolean {
  return releaseName(a) === releaseName(b);
}

// Everything published after the installed release, newest first. An installed version that is
// not on the list (older than the page, or never released) gives only the newest one.
export function releasesSince<T extends { tag_name: string; published_at?: string }>(
  releases: T[],
  current: string,
): T[] {
  const sorted = [...releases].sort((a, b) =>
    (b.published_at ?? "").localeCompare(a.published_at ?? ""),
  );
  const installed = sorted.findIndex((r) => isSameRelease(r.tag_name, current));
  return sorted.slice(0, installed < 0 ? 1 : installed);
}

export function lastPublished<T extends { published_at?: string }>(releases: T[]): T | undefined {
  return [...releases].sort((a, b) =>
    (b.published_at ?? "").localeCompare(a.published_at ?? ""),
  )[0];
}
