import { useEffect, useMemo, useRef, useState } from "react";
import ChampionIcon from "./ChampionIcon";
import { getChampionName, useChampionData } from "../hooks/useChampions";

interface ChampionComboboxProps {
  value: number | null;
  onChange: (championId: number | null) => void;
  onQueryChange?: (query: string) => void;
  placeholder?: string;
}

export function ChampionCombobox({
  value,
  onChange,
  onQueryChange,
  placeholder = "Search champion",
}: ChampionComboboxProps) {
  const champData = useChampionData();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allChampions = useMemo(() => {
    return Object.entries(champData)
      .map(([id, c]) => ({ id: Number(id), name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [champData]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allChampions.slice(0, 40);
    return allChampions.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 40);
  }, [allChampions, query]);

  useEffect(() => {
    if (value == null) {
      setQuery("");
      onQueryChange?.("");
      return;
    }
    const name = getChampionName(champData, value);
    setQuery(name);
  }, [value, champData, onQueryChange]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const commit = (id: number | null) => {
    onChange(id);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[highlight];
      if (pick) commit(pick.id);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "Backspace" && query.length === 0 && value != null) {
      commit(null);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onQueryChange?.(e.target.value);
          setOpen(true);
          setHighlight(0);
          if (e.target.value === "") onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-56 rounded-lg border border-lol-border bg-lol-card px-3 py-2 text-[13px] text-lol-text-bright outline-none transition-colors placeholder:text-lol-text/60 focus:border-lol-crimson/60"
      />
      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-40 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-lol-border bg-lol-card shadow-xl"
        >
          {filtered.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === highlight}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(c.id);
              }}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] transition-colors ${
                i === highlight
                  ? "bg-lol-crimson/20 text-lol-text-bright"
                  : "text-lol-text hover:bg-white/[0.04] hover:text-lol-text-bright"
              }`}
            >
              <ChampionIcon championId={c.id} size={22} className="rounded" />
              <span className="truncate">{c.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
