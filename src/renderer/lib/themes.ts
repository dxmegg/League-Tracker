// "redesign" is the main theme: the app starts in it unless another one was picked
export const DEFAULT_THEME = "redesign";

export const THEME_OPTIONS = [
  { value: "redesign", label: "Redesign" },
  { value: "experiment", label: "Legacy Theme" },
  { value: "test", label: "Ancient Theme" },
] as const;

// A stored value that is no longer a theme (the removed Third to Sixth) falls back to the default
export function resolveTheme(stored: unknown): string {
  return THEME_OPTIONS.find((o) => o.value === stored)?.value ?? DEFAULT_THEME;
}
