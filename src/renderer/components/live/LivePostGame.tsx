import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PostGameRecord } from "../../../shared/api";
import { formatTimeAgo } from "../../lib/format";
import { Panel } from "../Panel";
import { Title } from "./shared";

const KINDS: Record<string, string> = {
  eog: "End-of-game screen",
  mastery_updates: "Mastery and grade for the game",
  mastery_changes: "Mastery before and after",
  honor: "Honor received",
};

// Test view of what is captured after a game, shown raw until the real layout is decided
export function LivePostGame() {
  const [games, setGames] = useState<PostGameRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      window.api
        .getPostGameData?.()
        .then((rows) => {
          if (!cancelled) setGames(rows);
        })
        .catch(() => {});
    void load();
    const id = window.setInterval(() => void load(), 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <Panel variant="tile" accent="var(--color-lol-gold)">
      <Title aside={<span className="text-[13px] text-lol-text">test view</span>}>
        Post-game data
      </Title>
      {games.length === 0 ? (
        <p className="text-[12.5px] text-lol-text">
          Nothing captured yet. Keep the app running until the end-of-game screen closes.
        </p>
      ) : (
        games.map((game) => (
          <div key={game.gameId} className="border-b border-lol-border/25 py-2">
            <p className="text-[13px] text-lol-text-bright">
              <Link to={`/match/${game.gameId}`} className="font-semibold hover:underline">
                Game {game.gameId}
              </Link>{" "}
              <span className="text-lol-text">· {formatTimeAgo(game.recordedAt)}</span>
            </p>
            {Object.entries(game.data).map(([kind, data]) => (
              <details key={kind} className="mt-1">
                <summary className="cursor-pointer text-[12px] text-lol-text">
                  {KINDS[kind] ?? kind}
                  {Array.isArray(data) ? ` (${data.length})` : ""}
                </summary>
                <pre className="scroll-themed mt-1 max-h-[320px] overflow-auto rounded-lg border border-lol-border/60 bg-black/40 p-3 font-mono text-[11px] text-lol-text-bright">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        ))
      )}
    </Panel>
  );
}
