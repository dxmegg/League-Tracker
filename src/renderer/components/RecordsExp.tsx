import type {
  AccountListItem,
  RecordMatchRef,
  RecordsData,
  StatRecord,
  StreakRecord,
} from "../lib/types";
import { formatDuration } from "../lib/format";
import ChampionIcon from "./ChampionIcon";
import { RecordTile } from "./RecordTile";
import QueueSelect from "./QueueSelect";
import { FilterSelect } from "./FilterSelect";
import { Panel } from "./Panel";
import { SectionHeading } from "./SectionHeading";
import { FlameIcon, HourglassIcon, ShieldIcon, StarIcon, TimerIcon, TrophyIcon } from "./icons";

function DecimalRecordTile({
  label,
  value,
  match,
  perfect = false,
}: {
  label: string;
  value: number;
  match: RecordMatchRef;
  perfect?: boolean;
}) {
  return (
    <RecordTile
      label={label}
      value={value}
      championId={match.champion_id}
      win={match.win}
      gameCreation={match.game_creation}
      gameId={String(match.game_id)}
      formatValue={(raw) => (perfect ? "Perfect" : Number.isFinite(raw) ? raw.toFixed(2) : "—")}
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

function FlawlessAceTile({ record }: { record: StatRecord }) {
  return (
    <RecordTile
      label="Flawless Ace"
      value={record.value}
      championId={record.match.champion_id}
      win={record.match.win}
      gameCreation={record.match.game_creation}
      gameId={String(record.match.game_id)}
      formatValue={(value) => value.toFixed(2)}
    />
  );
}

function QueueRecordCell({
  record,
  formatValue,
}: {
  record: StatRecord;
  formatValue: (record: StatRecord) => string;
}) {
  return (
    <div className="flex min-w-[100px] items-center gap-2">
      <ChampionIcon championId={record.match.champion_id} size={26} className="rounded-full" />
      <span className="tabular-nums text-lol-text-bright">{formatValue(record)}</span>
    </div>
  );
}

function BestByQueueTable({ records }: { records: NonNullable<RecordsData["bestByQueue"]> }) {
  const numberValue = (record: StatRecord) => record.value.toLocaleString();
  const kdaValue = (record: StatRecord) =>
    record.match.deaths === 0 ? "Perfect" : record.value.toFixed(2);
  return (
    <Panel>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="border-b border-lol-border/60 text-[11px] uppercase tracking-wider text-lol-text">
            <tr>
              <th className="px-3.5 py-3 font-semibold">Queue</th>
              <th className="px-3.5 py-3 font-semibold">Most kills</th>
              <th className="px-3.5 py-3 font-semibold">Highest KDA</th>
              <th className="px-3.5 py-3 font-semibold">Most damage</th>
              <th className="px-3.5 py-3 text-right font-semibold">Best win streak</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-lol-border/50">
            {records.map((record) => (
              <tr key={record.queueLabel} className="text-lol-text">
                <th className="px-3.5 py-3 font-semibold text-lol-text-bright">
                  {record.queueLabel}
                </th>
                <td className="px-3.5 py-3">
                  <QueueRecordCell record={record.mostKills} formatValue={numberValue} />
                </td>
                <td className="px-3.5 py-3">
                  <QueueRecordCell record={record.highestKda} formatValue={kdaValue} />
                </td>
                <td className="px-3.5 py-3">
                  <QueueRecordCell record={record.mostDamage} formatValue={numberValue} />
                </td>
                <td className="px-3.5 py-3 text-right tabular-nums text-lol-text-bright">
                  {record.bestWinStreak.count} games
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function MilestonesList({ milestones }: { milestones: NonNullable<RecordsData["milestones"]> }) {
  return (
    <Panel>
      <div className="divide-y divide-lol-border/50">
        {milestones.map((milestone) => (
          <div key={milestone.key} className="flex items-center gap-3 px-3.5 py-3">
            <span aria-hidden="true" className="text-lol-crimson">
              ◆
            </span>
            {milestone.championId !== undefined ? (
              <ChampionIcon championId={milestone.championId} size={30} className="rounded-full" />
            ) : (
              <span className="h-[30px] w-[30px] rounded-full border border-lol-border/60" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-lol-text-bright">{milestone.label}</div>
              <div className="text-xs text-lol-text">{recordDate(milestone.gameCreation)}</div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function RecentlyBrokenPanel({ records }: { records: NonNullable<RecordsData["recentlyBroken"]> }) {
  return (
    <Panel className="border-t-[3px] border-t-lol-gold">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="border-b border-lol-border/60 text-[11px] uppercase tracking-wider text-lol-text">
            <tr>
              <th className="px-3.5 py-3 font-semibold">Record</th>
              <th className="px-3.5 py-3 font-semibold">Value</th>
              <th className="px-3.5 py-3 text-right font-semibold">Date broken</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-lol-border/50">
            {records.map((record) => (
              <tr key={record.key} className="text-lol-text">
                <th className="px-3.5 py-3 font-semibold text-lol-text-bright">{record.label}</th>
                <td className="px-3.5 py-3 tabular-nums text-lol-text-bright">
                  {["fastestWin", "fastestLoss", "longestGame", "fastestPentakill"].includes(
                    record.key,
                  )
                    ? formatDuration(record.value)
                    : record.value.toLocaleString()}
                </td>
                <td className="px-3.5 py-3 text-right">{recordDate(record.gameCreation)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function SectionCount({ count }: { count: number }) {
  return (
    <span className="rounded-full border border-lol-border/70 px-2 py-0.5 text-[10px] font-semibold tracking-normal text-lol-text">
      {count} records
    </span>
  );
}

function AchievementCabinet({
  achievements,
}: {
  achievements: NonNullable<RecordsData["achievements"]>;
}) {
  const icons = [TrophyIcon, HourglassIcon, ShieldIcon, FlameIcon, StarIcon, TimerIcon];
  return (
    <Panel>
      <div className="grid grid-cols-3 gap-2.5 2xl:grid-cols-6">
        {achievements.map((achievement, index) => {
          const Icon = icons[index] ?? TrophyIcon;
          const progress = Math.min(100, (achievement.current / achievement.target) * 100);
          return (
            <div
              key={achievement.key}
              className={`flex min-w-0 flex-col rounded-lg border p-3 transition-colors ${
                achievement.unlocked
                  ? "border-lol-gold/60 bg-lol-gold/10"
                  : "border-lol-border/60 bg-black/10"
              }`}
            >
              <div
                className={`mb-2 flex h-8 w-8 items-center justify-center rounded-full border ${
                  achievement.unlocked
                    ? "border-lol-gold/70 bg-lol-gold/15 text-lol-gold"
                    : "border-lol-border/70 bg-lol-border/20 text-lol-text"
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div
                className={`truncate text-xs font-bold ${
                  achievement.unlocked ? "text-lol-text-bright" : "text-lol-text"
                }`}
                title={achievement.label}
              >
                {achievement.label}
              </div>
              <div className="mt-1 min-h-[2rem] text-[10px] leading-snug text-lol-text">
                {achievement.description}
              </div>
              <div className="mt-auto pt-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-lol-border/60">
                  <div
                    className={`h-full transition-all ${
                      achievement.unlocked ? "bg-lol-gold" : "bg-lol-crimson/70"
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div
                  className={`mt-1 text-[10px] font-semibold tabular-nums ${
                    achievement.unlocked ? "text-lol-gold" : "text-lol-text"
                  }`}
                >
                  {achievement.unlocked
                    ? "Unlocked"
                    : `${achievement.current.toLocaleString()} / ${achievement.target.toLocaleString()}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function RecordsExp({
  data,
  error,
  onRetry,
  accountName,
  queue,
  onQueueChange,
  account,
  accounts,
  onAccountChange,
}: {
  data: RecordsData | null;
  error: string | null;
  onRetry: () => Promise<void>;
  accountName?: string;
  queue: number | undefined;
  onQueueChange: (queue: number | undefined) => void;
  account: string | undefined;
  accounts: AccountListItem[];
  onAccountChange: (account: string | undefined) => void;
}) {
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

  if (error) {
    const errorMessage = error;
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
          <p className="text-sm font-semibold text-lol-text-bright">Failed to load records.</p>
          {errorMessage && <p className="mt-1 text-xs text-lol-text">{errorMessage}</p>}
          <button
            type="button"
            onClick={() => void onRetry()}
            className="mt-4 rounded-md border border-lol-border px-3 py-1.5 text-xs font-semibold text-lol-text transition-colors hover:border-lol-gold/60 hover:text-lol-text-bright"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

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
  const combatTiles = [
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
        perfect={bests.kda.perfect}
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
  ].filter((tile): tile is React.ReactElement => Boolean(tile));
  const economyTiles = [
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
  ].filter((tile): tile is React.ReactElement => Boolean(tile));
  const visionTiles = [
    data.visionScore && (
      <StandardRecordTile
        key="visionScore"
        label="Highest vision score"
        record={data.visionScore}
      />
    ),
    data.wardsPlaced && (
      <StandardRecordTile key="wardsPlaced" label="Most wards placed" record={data.wardsPlaced} />
    ),
    data.turretDamage && (
      <StandardRecordTile
        key="turretDamage"
        label="Most turret damage"
        record={data.turretDamage}
      />
    ),
    data.objectiveDamage && (
      <StandardRecordTile
        key="objectiveDamage"
        label="Most objective damage"
        record={data.objectiveDamage}
      />
    ),
  ].filter((tile): tile is React.ReactElement => Boolean(tile));
  const survivalTiles = [
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
    data.lossStreak && data.lossStreak.length > 1 && (
      <StreakTile key="lossStreak" label="Longest loss streak" streak={data.lossStreak} />
    ),
  ].filter((tile): tile is React.ReactElement => Boolean(tile));
  const combatCount = combatTiles.length;
  const economyCount = economyTiles.length;
  const visionCount = visionTiles.length;
  const survivalCount =
    survivalTiles.length + (data.fastestPentakill ? 1 : 0) + (data.flawlessAce ? 1 : 0);

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
      {data.achievements && data.achievements.length > 0 && (
        <div>
          <SectionHeading title="TROPHY CABINET" aside={<SectionCount count={6} />} />
          <AchievementCabinet achievements={data.achievements} />
        </div>
      )}
      {combatTiles.length > 0 && (
        <div>
          <SectionHeading title="COMBAT" aside={<SectionCount count={combatCount} />} />
          <Panel>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 [&>*]:!border-t-lol-crimson">
              {combatTiles}
            </div>
          </Panel>
        </div>
      )}
      {data.multikillTotals && (
        <div>
          <SectionHeading title="MULTIKILLS" aside={<SectionCount count={4} />} />
          <Panel>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Lifetime doubles", data.multikillTotals.doubles, "text-lol-assist"],
                ["Lifetime triples", data.multikillTotals.triples, "text-[var(--theme-gold)]"],
                ["Lifetime quadras", data.multikillTotals.quadras, "text-orange-400"],
                ["Lifetime pentakills", data.multikillTotals.pentakills, "text-lol-crimson"],
              ].map(([label, value, color]) => (
                <div
                  key={label}
                  className="rounded-lg border border-lol-border/60 border-t-[3px] border-t-orange-500 bg-black/10 p-3"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-lol-text">
                    {label}
                  </div>
                  <div className={`mt-1 font-display text-2xl font-bold tabular-nums ${color}`}>
                    {Number(value).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
      {economyTiles.length > 0 && (
        <div>
          <SectionHeading title="ECONOMY & FARMING" aside={<SectionCount count={economyCount} />} />
          <Panel>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 [&>*]:!border-t-[var(--theme-win)]">
              {economyTiles}
            </div>
          </Panel>
        </div>
      )}
      {visionTiles.length > 0 && (
        <div>
          <SectionHeading
            title="VISION & OBJECTIVES"
            aside={<SectionCount count={visionCount} />}
          />
          <Panel>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 [&>*]:!border-t-lol-assist">
              {visionTiles}
            </div>
          </Panel>
        </div>
      )}
      {(survivalTiles.length > 0 || data.fastestPentakill || data.flawlessAce) && (
        <div>
          <SectionHeading
            title="SURVIVAL & GAME LENGTH"
            aside={<SectionCount count={survivalCount} />}
          />
          <Panel>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 [&>*]:!border-t-lol-violet">
              {data.fastestPentakill && (
                <StandardRecordTile
                  label="Fastest pentakill"
                  record={data.fastestPentakill}
                  formatValue={formatDuration}
                />
              )}
              {data.flawlessAce && <FlawlessAceTile record={data.flawlessAce} />}
              {survivalTiles}
            </div>
          </Panel>
        </div>
      )}
      {data.bestByQueue && data.bestByQueue.length > 0 && (
        <div>
          <SectionHeading title="Best records by queue" />
          <BestByQueueTable records={data.bestByQueue} />
        </div>
      )}
      {data.milestones && data.milestones.length > 0 && (
        <div>
          <SectionHeading title="Milestones" />
          <MilestonesList milestones={data.milestones} />
        </div>
      )}
      {data.recentlyBroken && data.recentlyBroken.length > 0 && (
        <div>
          <SectionHeading
            title="RECENTLY BROKEN"
            aside={<SectionCount count={data.recentlyBroken.length} />}
          />
          <RecentlyBrokenPanel records={data.recentlyBroken} />
        </div>
      )}
    </div>
  );
}
