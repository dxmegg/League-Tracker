import { useState, type FormEvent } from "react";

export default function Experiments() {
  const [gameName, setGameName] = useState("");
  const [tagLine, setTagLine] = useState("");
  const [region, setRegion] = useState("euw");
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    </div>
  );
}
