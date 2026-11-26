import type { TimelineData, TimelineFrame } from "../../shared/api";
import { useIpc } from "../hooks/useIpc";
import { formatDuration, formatNumber } from "../lib/format";
import type { parseParticipants } from "../lib/participants";
import { LineChart } from "./LineChart";
import { MatchPlayerTimeline } from "./MatchPlayerTimeline";
import { Panel } from "./Panel";
import { Title } from "./live/shared";

type Player = ReturnType<typeof parseParticipants>[number];

// Howling Abyss bounds in game units, as Riot documents them for map 12
const MAP_MIN = -28;
const MAP_MAX = 12858;
const MAP_IMAGE = "https://ddragon.leagueoflegends.com/cdn/6.8.1/img/map/map12.png";
const MAP_SIZE = 512;

const toMap = (v: number) => ((v - MAP_MIN) / (MAP_MAX - MAP_MIN)) * MAP_SIZE;

// Team total minus enemy total at every frame
function teamLead(frames: TimelineFrame[], mine: Set<number>, key: "gold" | "xp" | "cs") {
  const byTime = new Map<number, number>();
  for (const f of frames) {
    const value = (f[key] ?? 0) * (mine.has(f.participant_id) ? 1 : -1);
    byTime.set(f.timestamp_ms, (byTime.get(f.timestamp_ms) ?? 0) + value);
  }
  const points = [...byTime].sort((a, b) => a[0] - b[0]);
  return {
    values: points.map((p) => p[1]),
    labels: points.map((p) => formatDuration(Math.round(p[0] / 1000))),
  };
}

const signed = (v: number) => `${v > 0 ? "+" : ""}${formatNumber(v)}`;

function LeadChart({ title, lead }: { title: string; lead: ReturnType<typeof teamLead> }) {
  const peak = Math.max(1, ...lead.values.map(Math.abs));
  return (
    <Panel variant="tile">
      <Title aside={<span className="text-[13px] text-lol-text">Above zero: your team ahead</span>}>
        {title}
      </Title>
      <LineChart
        values={lead.values}
        xLabels={lead.labels}
        format={signed}
        yFormat={(v) =>
          Math.abs(v) < 1000 ? signed(v) : `${v > 0 ? "+" : "-"}${(Math.abs(v) / 1000).toFixed(1)}k`
        }
        yTicks={[-peak, 0, peak]}
        min={-peak}
        max={peak}
        baseline={0}
        color="var(--theme-win)"
        height={190}
      />
    </Panel>
  );
}

export function MatchTimeline({
  gameId,
  players,
  patch,
}: {
  gameId: number;
  players: Player[];
  patch?: string | null;
}) {
  const { data, loading } = useIpc<TimelineData | null>(
    () => window.api.getTimeline(gameId),
    [gameId],
  );

  if (!data || data.frames.length === 0) {
    return (
      <p className="text-sm text-lol-text">
        {loading
          ? "Loading timeline…"
          : "No timeline saved for this game yet. The app downloads it while the League client is open."}
      </p>
    );
  }

  const myTeam = (players.find((p) => p.isSelf) ?? players[0])?.teamId;
  const mine = new Set(players.filter((p) => p.teamId === myTeam).map((p) => p.participantId));
  const byId = new Map(players.map((p) => [p.participantId, p]));
  const name = (id: number | null) => byId.get(id ?? 0)?.summonerName ?? "Turret or minion";
  const kills = data.events.filter(
    (e) => e.event_type === "CHAMPION_KILL" && e.position_x != null && e.position_y != null,
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <LeadChart title="Gold lead" lead={teamLead(data.frames, mine, "gold")} />
          <LeadChart title="XP lead" lead={teamLead(data.frames, mine, "xp")} />
          <LeadChart title="CS lead" lead={teamLead(data.frames, mine, "cs")} />
        </div>
        <Panel variant="tile">
          <Title
            aside={
              <span className="text-[13px] text-lol-text">
                <span className="text-lol-win">● your team's kills</span>{" "}
                <span className="text-lol-loss">● enemy kills</span>
              </span>
            }
          >
            Kill map
          </Title>
          <svg
            viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
            className="mx-auto block w-full max-w-[640px] rounded-lg"
            role="img"
            aria-label={`Map of ${kills.length} champion kills`}
          >
            <image href={MAP_IMAGE} width={MAP_SIZE} height={MAP_SIZE} />
            {kills.map((e) => {
              // The victim decides the colour: a turret kill still counts for the other team
              const ours = !mine.has(e.victim_id ?? 0);
              return (
                <circle
                  key={e.event_index}
                  cx={toMap(e.position_x!)}
                  // Game coordinates grow upwards, SVG grows downwards
                  cy={MAP_SIZE - toMap(e.position_y!)}
                  r={5}
                  fill={ours ? "var(--theme-win)" : "var(--theme-loss)"}
                  stroke="#000"
                  strokeWidth={1}
                >
                  <title>
                    {`${formatDuration(Math.round(e.timestamp_ms / 1000))} · ${name(e.killer_id)} killed ${name(e.victim_id)}`}
                  </title>
                </circle>
              );
            })}
          </svg>
        </Panel>
      </div>
      <MatchPlayerTimeline data={data} players={players} patch={patch} />
    </div>
  );
}
