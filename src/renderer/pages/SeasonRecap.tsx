import { EmptyState } from "../components/EmptyState";

export default function SeasonRecap() {
  return (
    <div className="flex min-h-full w-full flex-col gap-4">
      <h1 className="font-display text-[28px] font-bold leading-none text-lol-text-bright">
        Season Recap
      </h1>
      <EmptyState text="Nothing here yet." variant="roomy" />
    </div>
  );
}
