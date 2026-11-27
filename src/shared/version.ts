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

export function lastPublished<T extends { published_at?: string }>(releases: T[]): T | undefined {
  return [...releases].sort((a, b) =>
    (b.published_at ?? "").localeCompare(a.published_at ?? ""),
  )[0];
}
