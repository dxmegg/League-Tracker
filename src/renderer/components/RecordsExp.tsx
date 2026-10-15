import type {
  AccountListItem,
  HomeDashboardPayload,
  RecordMatchRef,
  RecordsData,
  StatRecord,
  StreakRecord,
} from "../lib/types";
import { formatDuration } from "../lib/format";
import ChampionIcon from "./ChampionIcon";
import { RecordTile } from "./RecordTile";
import StatCard from "./StatCard";
import QueueSelect from "./QueueSelect";
import { FilterSelect } from "./FilterSelect";
import { Panel } from "./Panel";
import { SectionHeading } from "./SectionHeading";

function DecimalRecordTile({
  label,
  value,
  match,
}: {
  label: string;
  value: number;
  match: RecordMatchRef;
}) {
  return (
    <RecordTile
      label={label}
      value={value}
      championId={match.champion_id}
      win={match.win}
      gameCreation={match.game_creation}
      gameId={String(match.game_id)}
      formatValue={(raw) => (Number.isFinite(raw) ? raw.toFixed(2) : "—")}
    />
  );
}

function recordDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StreakTile({ label, streak }: { label: string; streak: StreakRecord }) {
  const range = `${recordDate(streak.start)} → ${recordDate(streak.end)}`;
  return (
    <div className="flex flex-col rounded-xl border border-lol-border border-t-[3px] border-t-lol-violet bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.08),transparent_55%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] px-3.5 py-3 transition-colors duration-[120ms]">
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
        <span>{range}</span>
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
      gameId={String(record.match.game_id)}
      formatValue={formatValue}
    />
  );
}

export function RecordsExp({
  data,
  accountName,
  dashboard,
  queue,
  onQueueChange,
  account,
  accounts,
  onAccountChange,
  scopeLabel,
}: {
  data: RecordsData | null;
  accountName?: string;
  dashboard: HomeDashboardPayload | null;
  queue: number | undefined;
  onQueueChange: (queue: number | undefined) => void;
  account: string | undefined;
  accounts: AccountListItem[];
  onAccountChange: (account: string | undefined) => void;
  scopeLabel: string;
}) {
  const summary = dashboard?.summary;
  const totalGames = summary?.totalGames ?? data?.totalGames ?? 0;
  const winRate =
    summary && summary.totalGames > 0 ? Math.round((summary.wins / summary.totalGames) * 100) : 0;
  const accountOptions = accounts.map((item) => ({
    value: item.puuid,
    label: `${item.gameName ?? "Unknown account"}${item.tagLine ? `#${item.tagLine}` : ""}`,
  }));
  const controls = (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      <QueueSelect value={queue} onChange={onQueueChange} variant="segmented" />
      <FilterSelect
        value={account}
        onChange={onAccountChange}
        placeholder="All Accounts"
        title="Account"
        options={accountOptions}
        allowClear
        variant="segmented"
      />
    </div>
  );

  if (!data) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
        <div className="relative rounded-xl border border-lol-border border-t-[3px] border-t-lol-crimson bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_10%,transparent),transparent_46%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-[30px] font-bold text-lol-text-bright">Records</h1>
              <p className="mt-1.5 text-lol-text">Personal bests across all accounts</p>
            </div>
            {controls}
          </div>
        </div>
        <div className="rounded-xl border border-lol-border bg-lol-card p-12 text-center">
          <p className="relative text-sm text-lol-text">Loading records…</p>
        </div>
      </div>
    );
  }

  if (data.totalGames === 0) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5">
        <div className="relative rounded-xl border border-lol-border border-t-[3px] border-t-lol-crimson bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_10%,transparent),transparent_46%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-[30px] font-bold text-lol-text-bright">Records</h1>
              <p className="mt-1.5 text-lol-text">Personal bests across all accounts</p>
            </div>
            {controls}
          </div>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-lol-border border-t-[3px] border-t-lol-crimson bg-[linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-12 text-center">
          <p className="relative text-sm font-semibold text-lol-text-bright">No records yet</p>
          <p className="relative mt-1 text-xs text-lol-text">
            Play more matches to set personal bests.
          </p>
        </div>
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
      <div className="shrink-0 rounded-xl border border-lol-border border-t-[3px] border-t-lol-crimson bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--theme-crimson)_10%,transparent),transparent_46%),linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="relative pl-4 font-display text-[30px] font-bold leading-tight tracking-[0.2px] text-lol-text-bright before:absolute before:left-0 before:top-1/2 before:h-2.5 before:w-2.5 before:-translate-y-1/2 before:rotate-45 before:bg-lol-crimson">
              Records
            </h1>
            <p className="relative mt-1.5 pl-4 text-lol-text">
              {accountName
                ? `Personal bests for ${accountName}`
                : "Personal bests across all accounts"}
            </p>
          </div>
          {controls}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Games"
          value={totalGames.toLocaleString()}
          subtext="In current scope"
        />
        <StatCard label="Win Rate" value={`${winRate}%`} subtext={`${summary?.wins ?? 0} wins`} />
        <StatCard
          label="Accounts"
          value={(summary?.accounts ?? accounts.length).toLocaleString()}
          subtext="With recorded games"
        />
        <StatCard label="Active Scope" value={scopeLabel} subtext="Queue · account" />
      </div>
      <div>
        <SectionHeading title="Personal bests" />
        <Panel>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{tiles}</div>
        </Panel>
      </div>
    </div>
  );
}
