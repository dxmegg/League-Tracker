import ChampionIcon from "./ChampionIcon";

export function LiveGameMock() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 font-display text-[14px] font-semibold text-lol-win">
        <span className="h-2 w-2 shrink-0 rounded-full bg-lol-win" />
        <span>Live game</span>
      </div>
      <div className="flex items-center gap-3.5">
        <ChampionIcon championId={141} size={64} className="rounded-full" />
        <div className="min-w-0">
          <strong className="block font-display text-[22px] font-bold leading-tight text-lol-text-bright">
            Karthus
          </strong>
          <small className="text-lol-text">ARAM Mayhem on szczypi siurek</small>
        </div>
      </div>
      <div className="font-display text-[44px] font-bold leading-none text-lol-text-bright tabular-nums">
        08:43
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-[10px] border border-lol-border bg-black/[0.12] px-3 py-2.5">
          <b className="block font-display text-[18px] font-bold text-lol-text-bright">
            9 / 4 / 12
          </b>
          <span className="text-[12.5px] text-lol-text">K / D / A</span>
        </div>
        <div className="rounded-[10px] border border-lol-border bg-black/[0.12] px-3 py-2.5">
          <b className="block font-display text-[18px] font-bold text-lol-text-bright">Level 11</b>
          <span className="text-[12.5px] text-lol-text">Champion</span>
        </div>
        <div className="rounded-[10px] border border-lol-border bg-black/[0.12] px-3 py-2.5">
          <b className="block font-display text-[18px] font-bold text-lol-text-bright">42</b>
          <span className="text-[12.5px] text-lol-text">CS</span>
        </div>
      </div>
    </div>
  );
}
