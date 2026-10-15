import { useNavigate, useParams } from "react-router-dom";
import { useIpc } from "../hooks/useIpc";
import { useChampionData } from "../hooks/useChampions";
import MatchScoreboard from "../components/MatchScoreboard";
import type { MatchDetail } from "../lib/types";

export default function MatchDetailPage() {
  const navigate = useNavigate();
  const { gameId } = useParams<{ gameId: string }>();
  const parsedGameId = Number(gameId);
  const validGameId = Number.isInteger(parsedGameId) && parsedGameId > 0;
  const champData = useChampionData();
  const { data: detail } = useIpc<MatchDetail>(
    () =>
      validGameId
        ? window.api.getMatchDetail(parsedGameId)
        : Promise.reject(new Error("Invalid match id")),
    [parsedGameId, validGameId],
  );

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5 p-5">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="w-fit rounded-md border border-lol-border/60 bg-lol-card/40 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-lol-text transition-colors hover:border-lol-gold/60 hover:text-lol-text-bright"
      >
        Back to records
      </button>
      <div className="rounded-xl border border-lol-border bg-[linear-gradient(180deg,var(--theme-card-hover),var(--theme-card))] p-5">
        <h1 className="mb-4 font-display text-2xl font-bold text-lol-text-bright">Match detail</h1>
        {detail ? (
          <div className="overflow-x-auto">
            <MatchScoreboard detail={detail} champData={champData} puuids={null} />
          </div>
        ) : (
          <p className="text-sm text-lol-text">
            {validGameId ? "Loading match…" : "This match link is invalid."}
          </p>
        )}
      </div>
    </div>
  );
}
