import { useState } from "react";
import type { TimelineData } from "../../shared/api";
import { lastTakedownMs, purchaseOrder, skillOrder } from "../../shared/match-build";
import { getItemName, useItemData } from "../hooks/useChampions";
import { formatDuration, formatNumber } from "../lib/format";
import type { parseParticipants } from "../lib/participants";
import ChampionIcon from "./ChampionIcon";
import ItemIcon from "./ItemIcon";
import { LineChart } from "./LineChart";
import { Panel } from "./Panel";
import { Title } from "./live/shared";

type Player = ReturnType<typeof parseParticipants>[number];

const clock = (ms: number) => formatDuration(Math.round(ms / 1000));

const CHARTS = [
  { key: "cs", title: "CS", color: "var(--theme-win)" },
  { key: "gold", title: "Gold earned", color: "var(--color-lol-gold)" },
  { key: "damage", title: "Damage to champions", color: "var(--theme-loss)" },
] as const;

// One player at a time: how their CS, gold and damage grew, what they bought and levelled
export function MatchPlayerTimeline({
  data,
  players,
  patch,
}: {
  data: TimelineData;
  players: Player[];
  patch?: string | null;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const player =
    players.find((p) => p.participantId === picked) ?? players.find((p) => p.isSelf) ?? players[0];
  const itemData = useItemData(patch);
  const frames = data.frames.filter((f) => f.participant_id === player.participantId);
  const labels = frames.map((f) => clock(f.timestamp_ms));
  const purchases = purchaseOrder(data.events, player.participantId);
  const skills = skillOrder(data.events, player.participantId);
  const takedown = lastTakedownMs(data.events, player.participantId);
  const minutes = (frames.at(-1)?.timestamp_ms ?? 0) / 60_000;
  // Purchases a minute apart or less belong to one visit to the shop
  const visits: (typeof purchases)[] = [];
  for (const purchase of purchases) {
    const visit = visits.at(-1);
    if (visit && purchase.ms - visit[0].ms < 60_000) visit.push(purchase);
    else visits.push([purchase]);
  }

  return (
    <div className="flex flex-col gap-5">
      <Panel variant="tile">
        <Title
          aside={
            <span className="text-[13px] text-lol-text">
              {minutes > 0 && `${((frames.at(-1)?.cs ?? 0) / minutes).toFixed(1)} CS/min`}
              {takedown != null && ` · last takedown ${clock(takedown)}`}
              {player.skinName ? ` · skin ${player.skinName}` : ""}
              {player.premadeGroup ? ` · premade group ${player.premadeGroup}` : ""}
            </span>
          }
        >
          {player.summonerName}
        </Title>
        <div className="flex flex-wrap gap-1.5">
          {players.map((p) => (
            <button
              key={p.participantId}
              type="button"
              aria-pressed={p === player}
              title={p.summonerName}
              aria-label={p.summonerName}
              onClick={() => setPicked(p.participantId)}
              className={`rounded-lg border-2 p-0.5 ${
                p === player ? "border-lol-gold" : "border-transparent opacity-60"
              }`}
            >
              <ChampionIcon championId={p.championId} size={36} className="rounded-md" />
            </button>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {CHARTS.map(({ key, title, color }) => {
          const values = frames.map((f) => f[key] ?? 0);
          return values.some((v) => v > 0) ? (
            <Panel key={key} variant="tile">
              <Title>{title}</Title>
              <LineChart
                values={values}
                xLabels={labels}
                format={formatNumber}
                color={color}
                min={0}
                height={170}
              />
            </Panel>
          ) : null;
        })}
      </div>

      {skills.length > 0 && (
        <Panel variant="tile">
          <Title>Skill order</Title>
          <ol className="flex flex-wrap gap-1">
            {skills.map((skill, i) => (
              <li
                key={i}
                className={`flex w-9 flex-col items-center rounded-md border border-lol-border/60 py-1 ${
                  skill === "R"
                    ? "bg-lol-gold/15 text-lol-gold"
                    : "bg-black/25 text-lol-text-bright"
                }`}
              >
                <span className="text-[10px] text-lol-text">{i + 1}</span>
                <span className="text-[14px] font-bold">{skill}</span>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {visits.length > 0 && (
        <Panel variant="tile">
          <Title aside={<span className="text-[13px] text-lol-text">Faded: sold</span>}>
            Item order
          </Title>
          <ol className="flex flex-wrap gap-2">
            {visits.map((visit, i) => (
              <li
                key={i}
                className="rounded-lg border border-lol-border/60 bg-black/25 px-2 py-1.5"
              >
                <div className="mb-1 text-[11px] tabular-nums text-lol-text">
                  {clock(visit[0].ms)}
                </div>
                <div className="flex gap-1">
                  {visit.map((p, j) => (
                    <span
                      key={j}
                      title={`${p.sold ? "Sold: " : ""}${getItemName(itemData, p.itemId)}`}
                      className={p.sold ? "opacity-35 grayscale" : ""}
                    >
                      <ItemIcon itemId={p.itemId} size={28} patch={patch} />
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </div>
  );
}
