import { useRef } from "react";

export interface TabStripItem {
  key: string;
  label: string;
  disabled?: boolean;
}

export function TabStrip({
  items,
  active,
  onChange,
  className = "",
}: {
  items: TabStripItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusEnabledTab = (startIndex: number, direction: 1 | -1) => {
    for (let step = 1; step <= items.length; step++) {
      const index = (startIndex + direction * step + items.length) % items.length;
      if (!items[index]?.disabled) {
        buttonRefs.current[index]?.focus({ preventScroll: true });
        return;
      }
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Champion detail sections"
      className={`flex min-w-0 shrink-0 gap-1 overflow-x-auto border-b border-lol-border/60 ${className}`}
    >
      {items.map((item, index) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={item.disabled ? "true" : undefined}
            disabled={item.disabled}
            tabIndex={isActive ? 0 : -1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (!item.disabled) onChange(item.key);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                focusEnabledTab(index, event.key === "ArrowRight" ? 1 : -1);
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (!item.disabled) onChange(item.key);
              }
            }}
            className={`shrink-0 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
              isActive
                ? "border-lol-crimson bg-lol-crimson text-lol-text-bright"
                : "border-transparent text-lol-text hover:text-lol-text-bright"
            } ${item.disabled ? "cursor-not-allowed opacity-40" : ""}`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
