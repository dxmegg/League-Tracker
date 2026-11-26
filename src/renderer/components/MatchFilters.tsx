import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MatchSort } from "../lib/types";

// Radix items cannot have an empty value, so "no selection" gets a sentinel
const NONE = "__none";

// Select with a leading "no selection" item showing the placeholder; shared by the match lists
export function FilterSelect<T extends string | number>({
  value,
  onChange,
  options,
  placeholder,
  title,
  className,
}: {
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  options: Array<{ value: T; label: string }>;
  placeholder: string;
  title: string;
  className?: string;
}) {
  return (
    <Select
      value={value === undefined ? NONE : String(value)}
      onValueChange={(v) => onChange(options.find((o) => String(o.value) === v)?.value)}
    >
      <SelectTrigger title={title} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={String(o.value)} value={String(o.value)}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// The unselected state is the default sort (date), so it isn't listed here
export const SORT_OPTIONS: { value: MatchSort; label: string }[] = [
  { value: "score", label: "Score" },
  { value: "kda", label: "KDA" },
  { value: "kills", label: "Kills" },
  { value: "deaths", label: "Deaths" },
  { value: "damageDealt", label: "Damage Dealt" },
  { value: "damageTaken", label: "Damage Taken" },
  { value: "healing", label: "Healing" },
  { value: "duration", label: "Duration" },
  { value: "cs", label: "CS" },
  { value: "gold", label: "Gold" },
  { value: "doubles", label: "Double Kills" },
  { value: "triples", label: "Triple Kills" },
  { value: "quadras", label: "Quadra Kills" },
  { value: "pentas", label: "Penta Kills" },
];

const RESULT_OPTIONS = [
  {
    label: "All",
    value: "all",
    active: "data-[state=active]:bg-lol-crimson data-[state=active]:text-white",
  },
  {
    label: "Wins",
    value: "win",
    active: "data-[state=active]:bg-lol-win data-[state=active]:text-[#04271b]",
  },
  {
    label: "Losses",
    value: "loss",
    active: "data-[state=active]:bg-lol-loss data-[state=active]:text-white",
  },
] as const;

export function ResultTabs({
  value,
  onChange,
  className,
}: {
  value: "win" | "loss" | undefined;
  onChange: (value: "win" | "loss" | undefined) => void;
  className?: string;
}) {
  return (
    <Tabs
      value={value ?? "all"}
      onValueChange={(v) => onChange(v === "all" ? undefined : (v as "win" | "loss"))}
    >
      <TabsList className={`border border-lol-border bg-lol-card ${className ?? ""}`}>
        {RESULT_OPTIONS.map((option) => (
          <TabsTrigger
            key={option.value}
            value={option.value}
            className={`font-display text-[12px] font-semibold ${option.active}`}
          >
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
