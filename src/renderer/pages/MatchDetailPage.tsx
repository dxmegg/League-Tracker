import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useIpc } from "../hooks/useIpc";
import { getChampionName, useChampionData } from "../hooks/useChampions";
import { LiveGameData } from "../components/live/LiveGameData";
import ChampionIcon from "../components/ChampionIcon";
import { MatchCompareTable } from "../components/MatchCompareTable";
import MatchScoreboardExp from "../components/MatchScoreboardExp";
import { queueLabel } from "../components/QueueSelect";
import { computeMatchScoreBreakdowns, scoreColor } from "../../shared/opScore";
import { formatDuration, formatNumber, formatTimeAgo, kdaRatio } from "../lib/format";
import { parseParticipants, scoreInputsFor } from "../lib/participants";
import type { MatchDetail } from "../lib/types";

function Tile({ label, children, sub }: { label: string; children: ReactNode; sub?: string }) {
  return (
    <div className="min-w-[118px] rounded-xl border border-lol-border/60 bg-black/25 px-4 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-widest text-lol-text">{label}</div>
      <div className="mt-0.5 font-display text-[20px] font-bold tabular-nums text-lol-text-bright">
        {children}
      </div>
      {sub && <div className="text-[11.5px] tabular-nums text-lol-text">{sub}</div>}
    </div>
  );
}

export default function MatchDetailPage() {
  const navigate = useNavigate();
  const { gameId } = useParams<{ gameId: string }>();
  const parsedGameId = Number(gameId);
  const validGameId = Number.isInteger(parsedGameId) && parsedGameId > 0;
  const champData = useChampionData();
  const [puuids, setPuuids] = useState<string[] | null>(null);
  const { data: detail } = useIpc<MatchDetail>(
    () =>
      validGameId
        ? window.api.getMatchDetail(parsedGameId)
        : Promise.reject(new Error("Invalid match id")),
    [parsedGameId, validGameId],
  );

  useEffect(() => {
    window.api.getAllSummonerPuuids().then(setPuuids);
  }, []);

  const players = useMemo(
    () => (detail ? parseParticipants(detail.participants, puuids) : []),
    [detail, puuids],
  );
  const self = players.find((p) => p.isSelf);
  const win = detail ? !!detail.stats.win : false;
  const score = useMemo(() => {
    if (!detail || !self) return null;
    const classes: Record<number, string | undefined> = {};
    for (const p of players) classes[p.championId] = champData?.[p.championId]?.class;
    return computeMatchScoreBreakdowns(scoreInputsFor(players, detail.game), classes).get(
      self.participantId,
    );
  }, [detail, self, players, champData]);
  // Kills per side, from the viewer's team
  const teamKills = useMemo(() => {
    const sum = (id: number | undefined) =>
      players.filter((p) => p.teamId === id).reduce((n, p) => n + p.kills, 0);
    const mine = self?.teamId;
    const other = players.find((p) => p.teamId !== mine)?.teamId;
    return { mine: sum(mine), other: sum(other) };
  }, [players, self]);

  const minutes = detail ? detail.game.game_duration / 60 : 0;
  const perMin = (v: number) => (minutes > 0 ? formatNumber(Math.round(v / minutes)) : "—");

  return (
    <div className="flex min-h-full w-full flex-col gap-5 pr-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="w-fit rounded-lg border border-lol-border/60 bg-lol-card/40 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-lol-text transition-colors hover:border-lol-gold/60 hover:text-lol-text-bright"
      >
        ← Back
      </button>

      {detail ? (
        <>
          <header
            className={`flex shrink-0 flex-wrap items-stretch overflow-hidden rounded-2xl border bg-lol-card ${
              win ? "border-lol-win/30" : "border-lol-loss/30"
            }`}
          >
            <div
              className={`flex w-[112px] flex-col items-center justify-center gap-0.5 border-r px-2 text-center ${
                win
                  ? "border-lol-win/40 bg-lol-win/15 text-lol-win"
                  : "border-lol-loss/40 bg-lol-loss/15 text-lol-loss"
              }`}
            >
              <span className="font-display text-[24px] font-bold uppercase tracking-wider">
                {win ? "Win" : "Loss"}
              </span>
              <span className="font-display text-[15px] font-semibold tabular-nums text-lol-text-bright">
                {formatDuration(detail.game.game_duration)}
              </span>
            </div>

            <div
              className={`flex flex-1 flex-wrap items-center gap-x-8 gap-y-4 p-5 ${
                win
                  ? "bg-[linear-gradient(90deg,color-mix(in_srgb,var(--theme-win)_10%,transparent),transparent_40%)]"
                  : "bg-[linear-gradient(90deg,color-mix(in_srgb,var(--theme-loss)_10%,transparent),transparent_40%)]"
              }`}
            >
              <div className="flex items-center gap-4">
                <ChampionIcon
                  championId={detail.stats.champion_id}
                  size={88}
                  className="h-[88px] w-[88px] rounded-xl border border-lol-border-hover"
                />
                <div>
                  <div className="font-display text-[24px] font-bold text-lol-text-bright">
                    {getChampionName(champData, detail.stats.champion_id)}
                  </div>
                  <div className="text-[13px] text-lol-text">
                    {queueLabel(detail.game.queue_id)}
                    {detail.game.game_version ? ` · Patch ${detail.game.game_version}` : ""}
                  </div>
                  <div className="text-[12.5px] text-lol-text">
                    {new Date(detail.game.game_creation).toLocaleString("pl-PL")} ·{" "}
                    {formatTimeAgo(detail.game.game_creation)}
                  </div>
                </div>
              </div>

              {self && (
                <div className="text-center">
                  <div className="font-display text-[32px] font-bold leading-none tabular-nums text-lol-text-bright">
                    {self.kills} / <span className="text-lol-loss">{self.deaths}</span> /{" "}
                    {self.assists}
                  </div>
                  <div className="mt-1.5 text-[13px] font-semibold text-lol-gold">
                    {kdaRatio(self.kills, self.deaths, self.assists)} KDA
                  </div>
                </div>
              )}

              {players.length > 0 && (
                <div className="text-center">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-lol-text">
                    Team kills
                  </div>
                  <div className="font-display text-[26px] font-bold tabular-nums">
                    <span className={win ? "text-lol-win" : "text-lol-loss"}>{teamKills.mine}</span>
                    <span className="mx-2 text-lol-text/50">:</span>
                    <span className={win ? "text-lol-loss" : "text-lol-win"}>
                      {teamKills.other}
                    </span>
                  </div>
                </div>
              )}

              {self && (
                <div className="ml-auto flex flex-wrap gap-2">
                  {score && (
                    <Tile label="Score" sub={score.badge ?? undefined}>
                      <span className={scoreColor(score.score)}>{score.score.toFixed(1)}</span>
                    </Tile>
                  )}
                  <Tile label="Damage" sub={`${perMin(self.totalDamageDealtToChampions)} dpm`}>
                    <span className="text-red-400">
                      {formatNumber(self.totalDamageDealtToChampions)}
                    </span>
                  </Tile>
                  <Tile label="Healed" sub={`${perMin(self.totalHeal)} hpm`}>
                    <span className="text-emerald-400">{formatNumber(self.totalHeal)}</span>
                  </Tile>
                  <Tile label="Tanked" sub={`${perMin(self.totalDamageTaken)} tpm`}>
                    <span className="text-sky-400">{formatNumber(self.totalDamageTaken)}</span>
                  </Tile>
                  <Tile label="Gold" sub={`${perMin(self.goldEarned)} gpm`}>
                    <span className="text-lol-gold">{formatNumber(self.goldEarned)}</span>
                  </Tile>
                  <Tile label="CS" sub={minutes > 0 ? `${(self.cs / minutes).toFixed(1)}/min` : ""}>
                    {self.cs}
                  </Tile>
                </div>
              )}
            </div>
          </header>

          <MatchScoreboardExp detail={detail} champData={champData} puuids={puuids} />
          {players.length > 0 && <MatchCompareTable players={players} />}
        </>
      ) : (
        <p className="text-sm text-lol-text">
          {validGameId ? "Loading match…" : "This match link is invalid."}
        </p>
      )}

      {validGameId && <LiveGameData gameId={parsedGameId} />}
    </div>
  );
}
