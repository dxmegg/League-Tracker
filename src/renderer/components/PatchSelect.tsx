import { useState, useEffect } from "react";
import { formatPatch } from "../lib/format";
import { FilterSelect } from "./FilterSelect";

export default function PatchSelect({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (patch: string | undefined) => void;
}) {
  const [patches, setPatches] = useState<string[]>([]);

  useEffect(() => {
    const fetchPatches = () =>
      window.api.getMatchFilterOptions().then((o) => setPatches(o.patches));
    fetchPatches();
    const unsub = window.api.onGamesUpdated(fetchPatches);
    return unsub;
  }, []);

  // Clear the selection if new data leaves it without any matching games
  useEffect(() => {
    if (value !== undefined && patches.length > 0 && !patches.includes(value)) {
      onChange(undefined);
    }
  }, [patches, value, onChange]);

  return (
    <FilterSelect
      value={value}
      onChange={(v) => onChange(v)}
      placeholder="All Patches"
      title="Patch"
      options={patches.map((p) => ({ value: p, label: `Patch ${formatPatch(p)}` }))}
    />
  );
}
