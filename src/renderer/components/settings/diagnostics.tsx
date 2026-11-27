import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Diagnostics, ServiceName } from "../../../shared/api";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { Button, Section } from "./parts";

const CLIENT: Record<Diagnostics["clientStatus"], string> = {
  connected: "Connected",
  ingame: "In game",
  connecting: "Connecting",
  disconnected: "Not connected",
};

type Tone = "good" | "wait" | "bad" | "idle";

const DOTS: Record<Tone, string> = {
  good: "bg-lol-win shadow-[0_0_8px_var(--theme-win)]",
  wait: "bg-amber-400",
  bad: "bg-lol-loss",
  idle: "bg-lol-text/40",
};

type Service = { id: ServiceName; name: string; status: string; tone: Tone; details: string[] };

function schema(d: Diagnostics): { text: string; tone: Tone } {
  if (d.schemaVersion === d.latestSchemaVersion) return { text: "Current", tone: "good" };
  return d.schemaVersion < d.latestSchemaVersion
    ? { text: `Outdated: this program uses v${d.latestSchemaVersion}`, tone: "bad" }
    : { text: "Newer than this program", tone: "bad" };
}

// The history service is not probed: it counts as answering once it has. A failure outranks an
// earlier answer until the service answers again.
function services(d: Diagnostics): Service[] {
  const answered = (id: ServiceName): Pick<Service, "status" | "tone" | "details"> => {
    const failure = d.lastFailure[id];
    if (failure) {
      return { status: "Not working", tone: "bad", details: [`Problem: ${failure.reason}`] };
    }
    return d.lastSuccess[id]
      ? { status: "Answering", tone: "good", details: [] }
      : { status: "Not asked yet", tone: "idle", details: [] };
  };
  const client = d.clientStatus;
  const riot = answered("riot");
  const github = answered("github");
  const release = d.release;
  return [
    {
      id: "client",
      name: "League client",
      status: CLIENT[client],
      tone: client === "disconnected" ? "bad" : client === "connecting" ? "wait" : "good",
      details: d.clientVersion ? [`Version ${d.clientVersion}`] : [],
    },
    { id: "history", name: "Match history", ...answered("history") },
    {
      id: "riot",
      name: "Riot API",
      ...riot,
      status: riot.tone === "good" ? "Working" : riot.status,
    },
    {
      id: "github",
      name: "GitHub (updates)",
      ...github,
      details: [
        ...github.details,
        release?.hasUpdate
          ? `New version is available: ${release.latest}`
          : `Current version: ${d.appVersion}`,
      ],
    },
  ];
}

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;
const date = (time: number | null | undefined) =>
  time ? new Date(time).toLocaleString() : "Never";

const programRows = (d: Diagnostics): [string, string][] => [
  ["Version", `${d.appVersion} (${d.installed ? "installed" : "from source"})`],
  ["System", d.system],
  ["Runtime", d.runtime],
];

const databaseStats = (d: Diagnostics): [string, string][] => [
  ["Games", d.games.toLocaleString()],
  ["Size", megabytes(d.dbBytes)],
  ["Unused space inside", megabytes(d.freeBytes)],
  ["Schema version", `v${d.schemaVersion}`],
];

const folders = (d: Diagnostics) => [
  { name: "Program data", path: d.appDir, open: () => window.api.openProgramFolder() },
  { name: "Database", path: d.dbDir, open: () => window.api.openDbFolder() },
  { name: "Backups", path: d.backupDir, open: () => window.api.openBackupFolder() },
  { name: "Logs", path: d.logsDir, open: () => window.api.openLogsFolder() },
];

function report(d: Diagnostics): string {
  const block = (title: string, rows: [string, string][]) =>
    `${title}\n${rows.map(([name, value]) => `  ${name}: ${value}`).join("\n")}`;
  return [
    block("Program", programRows(d)),
    block(
      "Connections",
      services(d).map((s) => [
        s.name,
        `${[s.status, ...s.details].join(", ")} (last check: ${date(d.lastSuccess[s.id])})`,
      ]),
    ),
    block("Database", [
      ...databaseStats(d),
      ["Schema state", schema(d).text],
      ["Newest game", date(d.newestGame)],
      ["Last new match", date(d.lastGameAdded)],
    ]),
    block(
      "Folders",
      folders(d).map((f) => [f.name, f.path]),
    ),
  ].join("\n");
}

function Toast({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl border border-white/15 bg-white/[0.08] px-4 py-3 text-[13px] font-semibold text-lol-text-bright shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_18px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl backdrop-saturate-150 animate-in fade-in-0 slide-in-from-bottom-3"
    >
      <span className="h-2 w-2 rounded-full bg-lol-win shadow-[0_0_8px_var(--theme-win)]" />
      {children}
    </div>
  );
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "always" });

function since(time: number): string {
  const minutes = Math.floor((Date.now() - time) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return RELATIVE.format(-minutes, "minute");
  if (minutes < 24 * 60) return RELATIVE.format(-Math.floor(minutes / 60), "hour");
  return RELATIVE.format(-Math.floor(minutes / (24 * 60)), "day");
}

const REFRESH_MS = 5_000;

// A check that answers at once would only flash the bar
const MIN_CHECK_MS = 600;

export function DiagnosticsSections() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // The previous answer stays on screen while the next one is on its way
  const load = useCallback(async () => {
    setChecking(true);
    setError(null);
    const shown = new Promise((resolve) => window.setTimeout(resolve, MIN_CHECK_MS));
    try {
      setData(await window.api.getDiagnostics(true));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    await shown;
    setChecking(false);
  }, []);
  useEffect(() => void load(), [load]);

  // Follows what the program does in the meantime, and keeps the "ago" texts moving
  useEffect(() => {
    const timer = window.setInterval(() => {
      window.api
        .getDiagnostics(false)
        .then(setData)
        .catch(() => {});
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const save = async () => {
    if (!data) return;
    try {
      if (await window.api.saveReport(report(data), data)) setToast("Report saved");
    } catch {
      setError("Could not save the report");
    }
  };

  const copy = async () => {
    if (!data) return;
    try {
      await window.api.copyText(report(data));
      setToast("Report copied to the clipboard");
    } catch {
      setError("Could not copy the report");
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
      <div className="flex flex-wrap items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={() => void copy()} disabled={!data}>
              Copy report
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[280px]">
            Copies everything on this page as text, to paste into a bug report. Folder paths include
            your Windows user name.
          </TooltipContent>
        </Tooltip>
        <Button variant="subtle" onClick={() => void save()} disabled={!data}>
          Export…
        </Button>
        <Button variant="subtle" onClick={() => void load()} disabled={checking}>
          {checking ? "Checking…" : "Check again"}
        </Button>
      </div>

      <div
        role="progressbar"
        aria-label="Checking"
        aria-hidden={!checking}
        className={`h-1 overflow-hidden rounded-full bg-white/[0.06] transition-opacity ${checking ? "opacity-100" : "opacity-0"}`}
      >
        {checking && (
          <i className="progress-sweep block h-full w-1/3 rounded-full bg-lol-crimson" />
        )}
      </div>

      {error && <p className="text-[12.5px] text-lol-loss">{error}</p>}

      {data && (
        <>
          <Section title="Connections">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {services(data).map((service) => (
                <div
                  key={service.id}
                  className="rounded-xl border border-lol-border/50 bg-black/25 px-4 py-3"
                >
                  <p className="text-[11px] font-bold uppercase tracking-widest text-lol-text">
                    {service.name}
                  </p>
                  <p className="mt-1.5 flex items-center gap-2 font-display text-[16px] font-bold text-lol-text-bright">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${DOTS[service.tone]}`} />
                    {service.status}
                  </p>
                  <p
                    className="mt-1 text-[11.5px] text-lol-text"
                    title={date(data.lastSuccess[service.id])}
                  >
                    {data.lastSuccess[service.id]
                      ? `Last check: ${since(data.lastSuccess[service.id]!)}`
                      : "Not checked since the program started"}
                  </p>
                  {service.id === "history" && data.lastGameAdded && (
                    <p className="text-[11.5px] text-lol-text" title={date(data.lastGameAdded)}>
                      Last update: {since(data.lastGameAdded)}
                    </p>
                  )}
                  {service.details.map((detail) => (
                    <p
                      key={detail}
                      className={`text-[11.5px] ${detail.startsWith("New version") ? "font-semibold text-lol-gold" : "text-lol-text"}`}
                    >
                      {detail}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </Section>

          <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
            <Section title="Program">
              <dl className="divide-y divide-lol-border/30">
                {programRows(data).map(([name, value]) => (
                  <div key={name} className="py-2">
                    <dt className="text-[11px] font-bold uppercase tracking-widest text-lol-text">
                      {name}
                    </dt>
                    <dd className="select-text text-[13px] text-lol-text-bright">{value}</dd>
                  </div>
                ))}
              </dl>
            </Section>
            <Section title="Database">
              <dl className="grid grid-cols-2 gap-3">
                {databaseStats(data).map(([name, value]) => (
                  <div
                    key={name}
                    className="rounded-xl border border-lol-border/50 bg-black/25 px-4 py-3"
                  >
                    <dt className="text-[11px] font-bold uppercase tracking-widest text-lol-text">
                      {name}
                    </dt>
                    <dd className="mt-1 font-display text-[22px] font-bold tabular-nums text-lol-text-bright">
                      {value}
                    </dd>
                    {name === "Schema version" && (
                      <dd className="mt-0.5 flex items-center gap-2 text-[11.5px] text-lol-text-bright">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${DOTS[schema(data).tone]}`}
                        />
                        {schema(data).text}
                      </dd>
                    )}
                  </div>
                ))}
              </dl>
              <p className="text-[11.5px] text-lol-text">Newest game: {date(data.newestGame)}</p>
            </Section>
          </div>

          <Section title="Folders">
            {folders(data).map((folder) => (
              <div
                key={folder.name}
                className="flex items-center gap-4 rounded-xl border border-lol-border/50 bg-black/25 px-4 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-lol-text">
                    {folder.name}
                  </p>
                  <p className="select-text break-all font-mono text-[12px] text-lol-text-bright">
                    {folder.path}
                  </p>
                </div>
                <Button
                  variant="subtle"
                  className="!h-7 !px-2.5"
                  aria-label={`Open the ${folder.name.toLowerCase()} folder`}
                  onClick={() => void folder.open()}
                >
                  Open
                </Button>
              </div>
            ))}
          </Section>
        </>
      )}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
