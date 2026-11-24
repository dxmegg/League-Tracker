import { Panel } from "../components/Panel";

// Placeholder: the tab exists, its content comes later
export default function MatchHistoryTab() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <Panel variant="tile" accent="var(--color-lol-gold)">
        <h1 className="font-display text-[22px] font-bold text-lol-text-bright">Match History</h1>
      </Panel>
    </div>
  );
}
