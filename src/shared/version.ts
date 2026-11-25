// The one place that names where releases and updates come from
export const REPOSITORY = "dxmegg/Rift-Records";
export const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;

// Release tags have been v1.0.10, v1.1 and v.1.0.8, so the patch number and the dot are optional
export function parseVersion(version: string): number[] | null {
  const m = version.trim().match(/^(?:v\.?)?(\d+)\.(\d+)(?:\.(\d+))?/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
}

// Positive when a is newer than b, negative when older, 0 when equal. An
// unparseable tag sorts as older, so a malformed release can never present
// itself as an update.
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}
