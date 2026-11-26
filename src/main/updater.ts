import { app, BrowserWindow } from "electron";
import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { once } from "events";
import { finished } from "stream/promises";
import { compareVersions, REPOSITORY as UPDATE_REPOSITORY } from "../shared/version";
import { HIDDEN_FLAG, leaveStartHiddenNote, takeStartHiddenNote } from "./autostart";
import type { UpdateProgress } from "../shared/api";

const CHECK_TIMEOUT_MS = 10_000;
const UPDATE_API_URL = `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases`;
const UPDATE_DOWNLOAD_URL_PREFIX = `https://github.com/${UPDATE_REPOSITORY}/`;
// One page covers any realistic gap between installs, and costs the same single
// request the old /releases/latest check did.
const RELEASE_PAGE_SIZE = 20;
// Release bodies are hand-written, but they still arrive over the network, so
// cap what the dialog is asked to lay out.
const MAX_BODY_CHARS = 4_000;
// Applied per chunk rather than to the whole download: the asset is ~90 MB, so
// a total-duration cap would abort a slow but perfectly healthy connection.
// What we actually want to catch is a transfer that has stopped moving.
const DOWNLOAD_STALL_TIMEOUT_MS = 30_000;

export interface ReleaseNote {
  version: string;
  publishedAt: string;
  body: string;
  url: string;
}

export interface UpdateInfo {
  hasUpdate: boolean;
  latest?: string;
  current?: string;
  url?: string;
  assetUrl?: string;
  assetSize?: number;
  // Every release newer than the installed version, newest first, so someone who
  // skipped a few versions sees the notes they missed rather than only the last
  // set. Empty when already up to date.
  releases?: ReleaseNote[];
  // True when the fetched page never reached back to the installed version, so
  // there are skipped releases the dialog cannot show.
  moreVersions?: boolean;
  error?: string;
  // False outside the installed program
  canInstall?: boolean;
}

// The expected hash never leaves the main process: the renderer only echoes
// back an asset URL, so trusting a digest it supplied would verify nothing.
type CachedAsset = { assetUrl: string; sha256: string | null };
let lastCheckedAsset: CachedAsset | null = null;

function toReleaseNote(release: any): ReleaseNote {
  const body = String(release.body ?? "")
    .replace(/\r\n/g, "\n")
    // GitHub appends this to every generated body; the dialog already links to
    // the release page, so in a small window it is pure noise.
    .replace(/^[ \t]*\*\*Full Changelog\*\*:.*$/gim, "")
    .trim();
  return {
    version: String(release.tag_name).replace(/^v/, ""),
    publishedAt: typeof release.published_at === "string" ? release.published_at : "",
    body: body.length > MAX_BODY_CHARS ? `${body.slice(0, MAX_BODY_CHARS)}…` : body,
    url: typeof release.html_url === "string" ? release.html_url : "",
  };
}

// GitHub reports asset digests as "sha256:<hex>"
function parseDigest(digest: unknown): string | null {
  if (typeof digest !== "string") return null;
  const m = digest.match(/^sha256:([0-9a-f]{64})$/i);
  return m ? m[1].toLowerCase() : null;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  try {
    const res = await fetch(`${UPDATE_API_URL}?per_page=${RELEASE_PAGE_SIZE}`, {
      headers: { "User-Agent": "rift-records" },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!res.ok) return { hasUpdate: false, error: `GitHub answered HTTP ${res.status}` };
    const page = (await res.json()) as any;
    // Unlike /releases/latest, this endpoint includes drafts and prereleases,
    // which were never meant to be offered as an update.
    const published: any[] = (Array.isArray(page) ? page : []).filter(
      (r) => r && !r.draft && !r.prerelease && typeof r.tag_name === "string",
    );
    if (!published.length) return { hasUpdate: false, error: "No releases found" };

    const newest = published[0];
    const latest = String(newest.tag_name).replace(/^v/, "");
    const current = app.getVersion();
    const asset = (newest.assets as any[])?.find((a) => a.name?.endsWith(".exe"));
    if (asset?.browser_download_url) {
      lastCheckedAsset = {
        assetUrl: asset.browser_download_url,
        sha256: parseDigest(asset.digest),
      };
    }
    // A local build can sit ahead of the newest release, so compare versions
    // rather than just testing them for inequality.
    const hasUpdate = compareVersions(latest, current) > 0;
    const missed = hasUpdate
      ? published.filter((r) => compareVersions(r.tag_name, current) > 0)
      : [];
    const canInstall = app.isPackaged && process.platform === "win32";
    // Reaching a release at or below the installed version proves the page went
    // back far enough for the missed list to be complete. A short page means the
    // repo had nothing older to give, which proves it just as well — otherwise a
    // version older than the first ever release would claim missing notes.
    const reachedCurrent =
      page.length < RELEASE_PAGE_SIZE ||
      published.some((r) => compareVersions(r.tag_name, current) <= 0);
    return {
      hasUpdate,
      latest,
      current,
      url: newest.html_url as string,
      assetUrl: asset?.browser_download_url,
      assetSize: asset?.size,
      releases: missed.map(toReleaseNote),
      moreVersions: hasUpdate && !reachedCurrent,
      canInstall,
    };
  } catch {
    return { hasUpdate: false, error: "Failed to check for updates" };
  }
}

const TEMP_PREFIX = "rift-records-update-";

// The downloaded installer cannot delete itself; the next start does
export function removeUpdateLeftovers(): void {
  try {
    for (const name of fs.readdirSync(os.tmpdir())) {
      if (!name.startsWith(TEMP_PREFIX)) continue;
      try {
        fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
      } catch {
        // Still running: a later start gets it
      }
    }
  } catch (err) {
    console.warn("[update] could not clean up:", err);
  }
}

// A second download would race the first for the same target exe
let installing = false;

export async function downloadAndInstall(
  win: BrowserWindow,
  assetUrl: string,
): Promise<{ success: boolean; error?: string }> {
  if (installing) return { success: false, error: "An update is already in progress" };
  installing = true;
  const result = await runUpdate(win, assetUrl).catch((err: Error) => ({
    success: false,
    error: `Update failed: ${err.message}`,
  }));
  // Stays set after success: the app is quitting
  if (!result.success) installing = false;
  return result;
}

async function runUpdate(
  win: BrowserWindow,
  assetUrl: string,
): Promise<{ success: boolean; error?: string }> {
  if (!app.isPackaged || process.platform !== "win32") {
    return { success: false, error: "In-app update only works in the installed program" };
  }
  if (!assetUrl.startsWith(UPDATE_DOWNLOAD_URL_PREFIX)) {
    return { success: false, error: "Unexpected download URL" };
  }

  // Re-resolve the release if this URL isn't the one we last saw, so the hash
  // we check against always comes from GitHub rather than from the caller.
  if (lastCheckedAsset?.assetUrl !== assetUrl) {
    await checkForUpdate();
    if (lastCheckedAsset?.assetUrl !== assetUrl) {
      return { success: false, error: "That download is no longer the latest release" };
    }
  }
  const expectedSha256 = lastCheckedAsset.sha256;

  let tmpDir: string;
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  } catch (err: any) {
    return { success: false, error: `Failed to create temp dir: ${err.message}` };
  }

  const newExe = path.join(tmpDir, "rift-records-setup.exe");
  // Rearmed on every chunk, so the download is only abandoned once it has
  // genuinely stopped rather than merely being slow.
  const controller = new AbortController();
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const armStallTimer = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => controller.abort(), DOWNLOAD_STALL_TIMEOUT_MS);
  };

  try {
    armStallTimer();
    const res = await fetch(assetUrl, {
      headers: { "User-Agent": "rift-records" },
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      clearTimeout(stallTimer);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return { success: false, error: `Download failed (HTTP ${res.status})` };
    }
    const total = Number(res.headers.get("content-length")) || 0;
    const out = fs.createWriteStream(newExe);
    // Listening from the start: a write that fails (disk full, antivirus lock) before anything
    // listens would be an uncaught exception. The awaits below reject with the same error.
    out.on("error", () => {});
    const reader = res.body.getReader();
    const hash = crypto.createHash("sha256");
    let received = 0;
    let speed = 0;
    let sampledAt = Date.now();
    let sampledBytes = 0;
    const report = (phase: UpdateProgress["phase"]) => {
      if (win.isDestroyed()) return;
      const progress: UpdateProgress = {
        phase,
        percent: total ? Math.min(100, Math.round((received / total) * 100)) : 0,
        received,
        total,
        bytesPerSecond: speed,
      };
      win.webContents.send("update:progress", progress);
    };
    report("downloading");
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      armStallTimer();
      received += value.length;
      hash.update(value);
      if (!out.write(Buffer.from(value))) {
        await once(out, "drain");
      }
      const elapsed = Date.now() - sampledAt;
      if (elapsed >= 250) {
        speed = Math.round(((received - sampledBytes) / elapsed) * 1000);
        sampledAt = Date.now();
        sampledBytes = received;
        report("downloading");
      }
    }
    clearTimeout(stallTimer);
    out.end();
    await finished(out);
    report("verifying");
    if (total && received !== total) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return { success: false, error: "Download incomplete, please try again" };
    }

    // A release published before GitHub reported digests has nothing to check
    // against; HTTPS and the pinned host still stand on their own.
    if (expectedSha256) {
      const actual = hash.digest("hex");
      if (actual !== expectedSha256) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        console.error(`Update hash mismatch: expected ${expectedSha256}, got ${actual}`);
        return { success: false, error: "Downloaded file failed its integrity check" };
      }
    } else {
      console.warn("Release asset has no digest; skipping hash verification");
    }
    report("installing");
  } catch (err: any) {
    clearTimeout(stallTimer);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (err?.name === "AbortError" || err?.name === "TimeoutError") {
      return { success: false, error: "Download stalled, please try again" };
    }
    return { success: false, error: `Download failed: ${err.message}` };
  }

  // The installer replaces the files once the program has quit and starts it again
  if (process.argv.includes(HIDDEN_FLAG)) leaveStartHiddenNote();
  try {
    const setup = spawn(newExe, ["--updated", "/S", "--force-run"], {
      detached: true,
      stdio: "ignore",
    });
    await once(setup, "spawn");
    setup.unref();
  } catch (err: any) {
    takeStartHiddenNote();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { success: false, error: `Could not start the installer: ${err.message}` };
  }
  // Let the IPC response reach the renderer before quitting
  setTimeout(() => app.quit(), 200);
  return { success: true };
}
