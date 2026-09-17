export const HISTORY_SECTIONS_FULL: ReadonlyArray<{
  section: string;
  label: string;
}> = [
  { section: "champions", label: "CHAMPIONS" },
  { section: "augments", label: "AUGMENTS" },
  { section: "items", label: "ITEMS" },
  { section: "runes", label: "RUNES" },
  { section: "friends", label: "FRIENDS & FOES" },
  { section: "trends", label: "TRENDS" },
  { section: "records", label: "RECORDS" },
  { section: "total-stats", label: "MISC. DATA" },
];

export const HISTORY_SECTIONS_RUNES: ReadonlyArray<{
  section: string;
  label: string;
}> = [
  { section: "champions", label: "CHAMPIONS" },
  { section: "items", label: "ITEMS" },
  { section: "runes", label: "RUNES" },
  { section: "friends", label: "FRIENDS & FOES" },
  { section: "trends", label: "TRENDS" },
  { section: "records", label: "RECORDS" },
  { section: "total-stats", label: "MISC. DATA" },
];

export const HISTORY_SECTIONS_AUGMENTS: ReadonlyArray<{
  section: string;
  label: string;
}> = [
  { section: "champions", label: "CHAMPIONS" },
  { section: "augments", label: "AUGMENTS" },
  { section: "items", label: "ITEMS" },
  { section: "friends", label: "FRIENDS & FOES" },
  { section: "trends", label: "TRENDS" },
  { section: "records", label: "RECORDS" },
  { section: "total-stats", label: "MISC. DATA" },
];

const SECTIONS_BY_SCOPE: Record<string, ReadonlyArray<{ section: string; label: string }>> = {
  full: HISTORY_SECTIONS_FULL,
  mayhem: HISTORY_SECTIONS_AUGMENTS,
  arena: HISTORY_SECTIONS_AUGMENTS,
  aram: HISTORY_SECTIONS_RUNES,
  ranked: HISTORY_SECTIONS_RUNES,
  normal: HISTORY_SECTIONS_RUNES,
  rest: HISTORY_SECTIONS_FULL,
};

export function sectionsForScope(
  scope: string | undefined,
): ReadonlyArray<{ section: string; label: string }> {
  if (!scope) return HISTORY_SECTIONS_FULL;
  return SECTIONS_BY_SCOPE[scope] ?? HISTORY_SECTIONS_FULL;
}
