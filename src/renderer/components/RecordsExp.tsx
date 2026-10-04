import type { RecordMatchRef, RecordsData, StatRecord, StreakRecord } from "../lib/types";
import { formatDuration } from "../lib/format";
import ChampionIcon from "./ChampionIcon";
import { RecordTile } from "./RecordTile";

function DecimalRecordTile({
  label,
  value,
  match,
}: {
  label: string;
  value: number;
  match: RecordMatchRef;
}) {
  const date = new Date(match.game_creation).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="flex flex-col rounded-xl border border-lol-border bg-black/10 px-3.5 py-3">
      <span className="text-[12.5px] uppercase tracking-wider text-lol-text">{label}</span>
      <b className="my-0.5 font-display text-[28px] font-bold leading-tight text-lol-text-bright">
        {value.toFixed(2)}
      </b>
      <div className="flex items-center gap-2 text-[12.5px] text-lol-text">
        <ChampionIcon championId={match.champion_id} size={26} className="rounded-full" />
        <i className={`font-semibold not-italic ${match.win ? "text-lol-win" : "text-lol-loss"}`}>
          {match.win ? "WIN" : "LOSS"}
        </i>
        <span>{date}</span>
      </div>
    </div>
  );
}

function StreakTile({ label, streak }: { label: string; streak: StreakRecord }) {
  return (
    <div className="flex flex-col rounded-xl border border-lol-border bg-black/10 px-3.5 py-3">
      <span className="text-[12.5px] uppercase tracking-wider text-lol-text">{label}</span>
      <b className="my-0.5 font-display text-[28px] font-bold leading-tight text-lol-text-bright">
        {streak.length} games
      </b>
      <div className="flex items-center gap-2 text-[12.5px] text-lol-text">
        <ChampionIcon championId={streak.match.champion_id} size={26} className="rounded-full" />
        <i
          className={`font-semibold not-italic ${
            streak.match.win ? "text-lol-win" : "text-lol-loss"
          }`}
        >
          {streak.match.win ? "WIN" : "LOSS"}
        </i>
      </div>
    </div>
  );
}

function StandardRecordTile({
  label,
  record,
  formatValue,
}: {
  label: string;
  record: StatRecord;
  formatValue?: (value: number) => string;
}) {
  return (
    <RecordTile
      label={label}
      value={record.value}
      championId={record.match.champion_id}
      win={record.match.win}
      gameCreation={record.match.game_creation}
      formatValue={formatValue}
    />
  );
}

export function RecordsExp({ data }: { data: RecordsData | null }) {
  if (!data) {
    return <div className="py-12 text-center text-sm text-lol-text">Loading records…</div>;
  }

  if (data.totalGames === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm font-semibold text-lol-text-bright">No records yet</p>
        <p className="mt-1 text-xs text-lol-text">Play more matches to set personal bests.</p>
      </div>
    );
  }

  const { bests } = data;
  const tiles = [
    bests.kills && <StandardRecordTile key="kills" label="Most kills" record={bests.kills} />,
    bests.deaths && <StandardRecordTile key="deaths" label="Most deaths" record={bests.deaths} />,
    bests.assists && (
      <StandardRecordTile key="assists" label="Most assists" record={bests.assists} />
    ),
    bests.kda && (
      <DecimalRecordTile
        key="kda"
        label="Best KDA"
        value={bests.kda.value}
        match={bests.kda.match}
      />
    ),
    bests.score && <StandardRecordTile key="score" label="Highest score" record={bests.score} />,
    bests.damage && <StandardRecordTile key="damage" label="Most damage" record={bests.damage} />,
    bests.damageTaken && (
      <StandardRecordTile key="damageTaken" label="Most damage taken" record={bests.damageTaken} />
    ),
    bests.totalDamage && (
      <StandardRecordTile key="totalDamage" label="Most total damage" record={bests.totalDamage} />
    ),
    bests.trueDamage && (
      <StandardRecordTile key="trueDamage" label="Most true damage" record={bests.trueDamage} />
    ),
    bests.cs && <StandardRecordTile key="cs" label="Most CS" record={bests.cs} />,
    bests.csPerMinute && (
      <DecimalRecordTile
        key="csPerMinute"
        label="Best CS/min"
        value={bests.csPerMinute.value}
        match={bests.csPerMinute.match}
      />
    ),
    bests.gold && <StandardRecordTile key="gold" label="Most gold" record={bests.gold} />,
    bests.healing && (
      <StandardRecordTile key="healing" label="Most healing" record={bests.healing} />
    ),
    bests.killingSpree && (
      <StandardRecordTile
        key="killingSpree"
        label="Longest killing spree"
        record={bests.killingSpree}
      />
    ),
    bests.criticalStrike && (
      <StandardRecordTile key="criticalStrike" label="Biggest crit" record={bests.criticalStrike} />
    ),
    bests.longestGame && (
      <StandardRecordTile
        key="longestGame"
        label="Longest game"
        record={bests.longestGame}
        formatValue={formatDuration}
      />
    ),
    bests.fastestWin && (
      <StandardRecordTile
        key="fastestWin"
        label="Fastest win"
        record={bests.fastestWin}
        formatValue={formatDuration}
      />
    ),
    bests.fastestLoss && (
      <StandardRecordTile
        key="fastestLoss"
        label="Fastest loss"
        record={bests.fastestLoss}
        formatValue={formatDuration}
      />
    ),
    data.winStreak && (
      <StreakTile key="winStreak" label="Longest win streak" streak={data.winStreak} />
    ),
    data.lossStreak && (
      <StreakTile key="lossStreak" label="Longest loss streak" streak={data.lossStreak} />
    ),
  ].filter((tile): tile is React.ReactElement => Boolean(tile));

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
      <div>
        <h1 className="font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright">
          Records
        </h1>
        <p className="mt-1.5 text-lol-text">Personal bests across all accounts</p>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{tiles}</div>
    </div>
  );
}
