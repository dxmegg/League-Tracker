type SegmentedControlOption<T extends string | number> = {
  value: T | undefined;
  label: string;
};

interface SegmentedControlProps<T extends string | number> {
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  options: readonly SegmentedControlOption<T>[];
  label: string;
}

export function SegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
  label,
}: SegmentedControlProps<T>) {
  return (
    <div
      aria-label={label}
      className="inline-flex max-w-full overflow-x-auto rounded-lg border border-lol-border/60 bg-lol-card/40"
      role="group"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value === undefined ? "all" : String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`shrink-0 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors duration-150 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60 ${
              active
                ? "bg-lol-crimson text-white"
                : "text-lol-text hover:bg-white/[0.06] hover:text-lol-text-bright"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
