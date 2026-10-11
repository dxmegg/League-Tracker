import { useState, useEffect } from "react";
import { formatPatch } from "../lib/format";
import { SegmentedControl } from "./SegmentedControl";

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
      window.api.getMatchFilterOptions().then((o) => setPatches(o.patches.slice(0, 4)));
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
    <SegmentedControl
      value={value}
      onChange={(v) => onChange(v)}
      label="Patch"
      options={[
        { value: undefined, label: "All patches" },
        ...patches.map((p) => ({ value: p, label: formatPatch(p) })),
      ]}
    />
  );
}
