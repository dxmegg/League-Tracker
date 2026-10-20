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
      window.api.getMatchFilterOptions().then((o) => {
        const latest = [...o.patches].sort((a, b) => {
          const [aMajor, aMinor] = a.split(".").map(Number);
          const [bMajor, bMinor] = b.split(".").map(Number);
          return bMajor - aMajor || bMinor - aMinor;
        });
        setPatches(latest.slice(0, 15));
      });
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
      placeholder="ALL PATCHES"
      title="Patch"
      allowClear
      options={patches.map((patch) => ({
        value: patch,
        label: `PATCH ${formatPatch(patch).toUpperCase()}`,
      }))}
    />
  );
}
