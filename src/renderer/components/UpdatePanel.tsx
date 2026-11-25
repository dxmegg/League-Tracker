import { useEffect, useState } from "react";
import { checkForUpdates, installUpdate, useUpdater } from "../hooks/useUpdater";
import { useIpc } from "../hooks/useIpc";
import { REPOSITORY, REPOSITORY_URL } from "../../shared/version";
import type { UpdateProgress } from "../../shared/api";
import { Title } from "./live/shared";

const PHASES: Record<UpdateProgress["phase"], string> = {
  downloading: "Downloading",
  verifying: "Verifying the file",
  installing: "Installing, the app will restart",
};

const BUTTON =
  "h-9 rounded-lg border px-3.5 text-xs font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60";

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function ProgressBar({ progress }: { progress: UpdateProgress | null }) {
  const percent = progress?.percent ?? 0;
  const speed = progress?.bytesPerSecond ?? 0;
  const left =
    progress?.phase === "downloading" && speed > 0
      ? Math.ceil((progress.total - progress.received) / speed)
      : null;
  return (
    <div className="mt-3" aria-live="polite">
      <div className="mb-1.5 flex justify-between gap-3 text-[12px]">
        <span className="font-semibold text-lol-text-bright">
          {progress ? PHASES[progress.phase] : "Starting"}
        </span>
        <span className="tabular-nums text-lol-text-bright">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Update progress"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2.5 overflow-hidden rounded-full bg-white/10"
      >
        <div
          className="h-full rounded-full bg-lol-crimson transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
      {progress && (
        <p className="mt-1.5 text-[11.5px] tabular-nums text-lol-text">
          {megabytes(progress.received)}
          {progress.total > 0 && ` of ${megabytes(progress.total)}`}
          {progress.phase === "downloading" && ` · ${megabytes(speed)}/s`}
          {left !== null && ` · about ${left}s left`}
        </p>
      )}
    </div>
  );
}

export function UpdatePanel() {
  const { status, info, progress, error, checkedAt } = useUpdater();
  const { data: version } = useIpc(() => window.api.getVersion(), []);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    void window.api.getSetting("auto_update").then((value) => setAuto(value !== "false"));
  }, []);

  const release = info?.releases?.[0];
  const headline =
    status === "checking"
      ? "Checking for updates…"
      : status === "updating"
        ? `Updating to ${info?.latest}`
        : info?.hasUpdate
          ? `Version ${info.latest} is available`
          : info && !info.error
            ? "You have the latest version"
            : "Update status unknown";

  return (
    <section className="min-w-0" aria-label="Updates">
      <Title>Updates</Title>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[16px] font-bold text-lol-text-bright">{headline}</p>
          <p className="text-[12px] text-lol-text">
            Installed: {version ?? "…"}
            {info?.latest && ` · Latest: ${info.latest}`}
            {checkedAt && ` · Checked at ${new Date(checkedAt).toLocaleTimeString()}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void checkForUpdates()}
            disabled={status !== "idle"}
            className={`${BUTTON} border-lol-border/60 bg-lol-card/60 text-lol-text-bright hover:border-lol-crimson/60`}
          >
            Check version
          </button>
          {info?.hasUpdate && info.canInstall && info.assetUrl && (
            <button
              type="button"
              onClick={() => void installUpdate()}
              disabled={status !== "idle"}
              className={`${BUTTON} border-lol-crimson/70 bg-lol-crimson/25 text-lol-text-bright hover:bg-lol-crimson/45`}
            >
              Update now
              {info.assetSize ? ` (${megabytes(info.assetSize)})` : ""}
            </button>
          )}
        </div>
      </div>

      {status === "updating" && <ProgressBar progress={progress} />}
      {error && <p className="mt-3 text-[12px] text-lol-loss">{error}</p>}
      {info?.hasUpdate && !info.canInstall && (
        <p className="mt-3 text-[12px] text-lol-text">
          In-app updating works only in the portable exe. Download the new version from the release
          page.
        </p>
      )}

      {release && (
        <details className="mt-3 rounded-xl border border-lol-border/50 bg-black/25 px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-semibold text-lol-text-bright">
            What&apos;s new in {release.version}
          </summary>
          <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-[12px] text-lol-text">
            {release.body || "No release notes."}
          </p>
        </details>
      )}

      <div className="mt-3 border-t border-lol-border/30 pt-3 text-[12px] text-lol-text">
        <p>
          Updates come from GitHub Releases of{" "}
          <button
            type="button"
            onClick={() => window.api.openUrl(info?.url ?? `${REPOSITORY_URL}/releases`)}
            className="text-lol-gold hover:underline"
          >
            github.com/{REPOSITORY}
          </button>
          {release?.publishedAt &&
            ` · published ${new Date(release.publishedAt).toLocaleDateString()}`}
          .
        </p>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-lol-text-bright">
          <input
            type="checkbox"
            checked={auto}
            onChange={() => {
              setAuto(!auto);
              void window.api.setSetting("auto_update", String(!auto));
            }}
            className="h-4 w-4 accent-[var(--theme-crimson)]"
          />
          Install updates automatically when the app starts (never during a game)
        </label>
      </div>
    </section>
  );
}
