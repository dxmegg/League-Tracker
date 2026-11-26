// Everyone runs the redesign; the others are picked in developer mode only and are never stored
export const DEFAULT_THEME = "redesign";

export const THEME_OPTIONS = [
  { value: "redesign", label: "Redesign" },
  { value: "experiment", label: "Legacy Theme" },
  { value: "test", label: "Ancient Theme" },
] as const;
