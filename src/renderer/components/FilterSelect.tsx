import { useEffect, useRef, useState } from "react";
import { ArrowDownIcon } from "./icons";

type FilterOption<T extends string | number> = {
  value: T;
  label: string;
};

type NewFilterSelectProps<T extends string | number> = {
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  options: FilterOption<T>[];
  placeholder: string;
  className?: string;
  title?: string;
  disabled?: boolean;
};

export function FilterSelect<T extends string | number>(props: NewFilterSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedLabel =
    props.value === undefined
      ? props.placeholder
      : (props.options.find((option) => option.value === props.value)?.label ?? props.placeholder);

  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selectOption = (value: T | undefined) => {
    props.onChange(value);
    setOpen(false);
  };

  return (
    <div ref={ref} className={`relative inline-block ${props.className ?? ""}`}>
      <button
        type="button"
        title={props.title}
        disabled={props.disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !props.disabled && setOpen((value) => !value)}
        className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-deep)] disabled:cursor-not-allowed disabled:opacity-50 ${
          open || props.value !== undefined
            ? "border-lol-crimson/60 bg-lol-crimson/20 text-lol-text-bright"
            : "border-lol-border/50 bg-lol-card/40 text-lol-text hover:border-lol-crimson/40 hover:text-lol-text-bright"
        }`}
      >
        <span>{selectedLabel}</span>
        <ArrowDownIcon className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-80 min-w-full overflow-y-auto rounded-md border border-lol-crimson/40 bg-[linear-gradient(145deg,#0c0e11_0%,#090b0d_48%,#060809_100%)] p-1 shadow-[0_0_4px_rgba(150,30,30,0.35),0_0_12px_rgba(90,15,15,0.20)] ring-1 ring-inset ring-white/[0.03]"
        >
          <button
            type="button"
            role="option"
            aria-selected={props.value === undefined}
            onClick={() => selectOption(undefined)}
            className={`block w-full rounded-md px-2.5 py-1.5 text-left text-xs font-bold uppercase tracking-wider transition-colors ${
              props.value === undefined
                ? "bg-lol-crimson/20 text-lol-text-bright"
                : "text-lol-text hover:bg-lol-crimson/10 hover:text-lol-text-bright"
            }`}
          >
            {props.placeholder}
          </button>
          {props.options.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              role="option"
              aria-selected={option.value === props.value}
              onClick={() => selectOption(option.value)}
              className={`block w-full rounded-md px-2.5 py-1.5 text-left text-xs font-bold uppercase tracking-wider transition-colors ${
                option.value === props.value
                  ? "bg-lol-crimson/20 text-lol-text-bright"
                  : "text-lol-text hover:bg-lol-crimson/10 hover:text-lol-text-bright"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
