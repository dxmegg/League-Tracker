import { useState, type FormEvent } from "react";

export default function Experiments() {
  const [gameName, setGameName] = useState("");
  const [tagLine, setTagLine] = useState("");
  const [region, setRegion] = useState("euw");
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opggRegion, setOpggRegion] = useState("euw");
  const [opggGameName, setOpggGameName] = useState("");
  const [opggTagLine, setOpggTagLine] = useState("");
  const [opggSearchResult, setOpggSearchResult] = useState<unknown>(null);
  const [opggSummaryResult, setOpggSummaryResult] = useState<unknown>(null);
  const [opggGamesResult, setOpggGamesResult] = useState<unknown>(null);
  const [opggError, setOpggError] = useState<string | null>(null);
  const [opggLoading, setOpggLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await window.api.getSummonerGameHistoryFromMcp(
        gameName.trim(),
        tagLine.trim(),
        region.trim(),
      );
      if (
        typeof response === "object" &&
        response !== null &&
        "error" in response &&
        typeof response.error === "string"
      ) {
        setError(response.error);
        setResult(null);
      } else {
        setResult(response);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "MCP request failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleOpggSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOpggLoading(true);
    setOpggSearchResult(null);
    setOpggSummaryResult(null);
    setOpggGamesResult(null);
    setOpggError(null);

    try {
      const region = opggRegion.trim();
      const searchResult = await window.api.searchOpggSummoner(
        region,
        opggGameName.trim(),
        opggTagLine.trim(),
      );
      if (
        typeof searchResult === "object" &&
        searchResult !== null &&
        "error" in searchResult &&
        typeof searchResult.error === "string"
      ) {
        setOpggError(searchResult.error);
        return;
      }

      setOpggSearchResult(searchResult);
      const first = Array.isArray(searchResult) ? searchResult[0] : null;
      const summonerId =
        first && typeof first === "object" && "id" in first
          ? String((first as { id: unknown }).id)
          : null;
      if (!summonerId) {
        setOpggError("no results");
        return;
      }

      const [summaryResponse, gamesResponse] = await Promise.all([
        window.api.getOpggSummonerSummary(region, summonerId),
        window.api.getOpggRecentGames(region, summonerId, 20),
      ]);
      const summaryError =
        typeof summaryResponse === "object" &&
        summaryResponse !== null &&
        "error" in summaryResponse &&
        typeof summaryResponse.error === "string"
          ? summaryResponse.error
          : null;
      const gamesError =
        typeof gamesResponse === "object" &&
        gamesResponse !== null &&
        "error" in gamesResponse &&
        typeof gamesResponse.error === "string"
          ? gamesResponse.error
          : null;
      if (summaryError || gamesError) {
        setOpggError(summaryError ?? gamesError);
        return;
      }

      setOpggSummaryResult(summaryResponse);
      setOpggGamesResult(gamesResponse);
    } catch (err) {
      setOpggError(err instanceof Error ? err.message : "OP.GG request failed");
    } finally {
      setOpggLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-wide text-lol-text-bright">Experiments</h1>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-48 flex-col gap-1 text-xs text-lol-text">
          Riot ID name
          <input
            value={gameName}
            onChange={(event) => setGameName(event.target.value)}
            className="input h-9 rounded-lg border border-lol-gold/40 bg-lol-card px-3 text-sm text-lol-text-bright outline-none placeholder:text-lol-text/60 focus:border-lol-gold"
          />
        </label>
        <label className="flex min-w-32 flex-col gap-1 text-xs text-lol-text">
          Tag line
          <input
            value={tagLine}
            onChange={(event) => setTagLine(event.target.value)}
            className="input h-9 rounded-lg border border-lol-gold/40 bg-lol-card px-3 text-sm text-lol-text-bright outline-none placeholder:text-lol-text/60 focus:border-lol-gold"
          />
        </label>
        <label className="flex min-w-24 flex-col gap-1 text-xs text-lol-text">
          Region
          <input
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            className="input h-9 rounded-lg border border-lol-gold/40 bg-lol-card px-3 text-sm text-lol-text-bright outline-none placeholder:text-lol-text/60 focus:border-lol-gold"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg border border-lol-gold/40 bg-lol-card px-3 py-2 text-sm text-lol-text-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          Fetch from OP.GG
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-lol-loss">{error}</p>}
      {result !== null && (
        <pre className="mt-4 max-h-[60vh] overflow-auto rounded-lg border border-lol-border/60 bg-lol-card p-4 text-xs text-lol-text-bright whitespace-pre-wrap">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-lol-text-bright">OP.GG (direct scrape)</h2>
        <form onSubmit={handleOpggSearch} className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-48 flex-col gap-1 text-xs text-lol-text">
            Riot ID name
            <input
              value={opggGameName}
              onChange={(event) => setOpggGameName(event.target.value)}
              className="input h-9 rounded-lg border border-lol-gold/40 bg-lol-card px-3 text-sm text-lol-text-bright outline-none placeholder:text-lol-text/60 focus:border-lol-gold"
            />
          </label>
          <label className="flex min-w-32 flex-col gap-1 text-xs text-lol-text">
            Tag line
            <input
              value={opggTagLine}
              onChange={(event) => setOpggTagLine(event.target.value)}
              className="input h-9 rounded-lg border border-lol-gold/40 bg-lol-card px-3 text-sm text-lol-text-bright outline-none placeholder:text-lol-text/60 focus:border-lol-gold"
            />
          </label>
          <label className="flex min-w-24 flex-col gap-1 text-xs text-lol-text">
            Region
            <input
              value={opggRegion}
              onChange={(event) => setOpggRegion(event.target.value)}
              className="input h-9 rounded-lg border border-lol-gold/40 bg-lol-card px-3 text-sm text-lol-text-bright outline-none placeholder:text-lol-text/60 focus:border-lol-gold"
            />
          </label>
          <button
            type="submit"
            disabled={opggLoading}
            className="rounded-lg border border-lol-gold/40 bg-lol-card px-3 py-2 text-sm text-lol-text-bright disabled:cursor-not-allowed disabled:opacity-50"
          >
            Search OP.GG
          </button>
        </form>

        {opggError && <p className="mt-3 text-sm text-lol-loss">{opggError}</p>}
        {opggSearchResult !== null && (
          <pre className="mt-4 max-h-[40vh] overflow-auto rounded-lg border border-lol-border/60 bg-lol-card p-4 text-xs text-lol-text-bright whitespace-pre-wrap">
            {JSON.stringify(opggSearchResult, null, 2)}
          </pre>
        )}
        {opggSummaryResult !== null && (
          <pre className="mt-4 max-h-[40vh] overflow-auto rounded-lg border border-lol-border/60 bg-lol-card p-4 text-xs text-lol-text-bright whitespace-pre-wrap">
            {JSON.stringify(opggSummaryResult, null, 2)}
          </pre>
        )}
        {opggGamesResult !== null && (
          <pre className="mt-4 max-h-[40vh] overflow-auto rounded-lg border border-lol-border/60 bg-lol-card p-4 text-xs text-lol-text-bright whitespace-pre-wrap">
            {JSON.stringify(opggGamesResult, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}
