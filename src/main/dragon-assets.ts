/**
 * Caches remote Dragon PNGs on disk so repeated history renders do not
 * re-download unchanged assets. Failed URLs are remembered for the session to
 * avoid retry storms during a CDN outage. SHA-1 of the full URL gives each
 * variant a stable collision-resistant filename without exposing URL syntax in
 * the cache path. A custom protocol serves the bytes without granting the
 * renderer broad file:// access to the application's data directory.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { protocol } from "electron";
import { getDataDir } from "./paths";

const REQUEST_TIMEOUT_MS = 10_000;
const DRAGON_ASSET_SCHEME = "dragon-asset";
const DRAGON_IMAGE_DIR = "dragon-images";
const ALLOWED_REMOTE_HOSTS = new Set(["raw.communitydragon.org", "ddragon.leagueoflegends.com"]);

const sessionFailures = new Set<string>();
const loggedErrors = new Set<string>();

function logUnexpectedOnce(remoteUrl: string, error: unknown): void {
  if (loggedErrors.has(remoteUrl)) return;
  loggedErrors.add(remoteUrl);
  console.error("[dragon-assets] unexpected asset error:", { remoteUrl, error });
}

function assetHash(remoteUrl: string): string {
  return crypto.createHash("sha1").update(remoteUrl).digest("hex");
}

function assetPath(hash: string): string {
  return path.join(getDataDir(), DRAGON_IMAGE_DIR, `${hash}.png`);
}

function isAllowedRemoteUrl(remoteUrl: string): boolean {
  try {
    const url = new URL(remoteUrl);
    return url.protocol === "https:" && ALLOWED_REMOTE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function assetHashFromRequest(requestUrl: string): string | null {
  try {
    const url = new URL(requestUrl);
    const candidate = `${url.hostname}${url.pathname}`.replace(/^\/+|\/+$/g, "");
    return /^[a-f0-9]{40}$/.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function registerDragonAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: DRAGON_ASSET_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

export function registerDragonAssetProtocol(): void {
  protocol.handle(DRAGON_ASSET_SCHEME, async (request) => {
    const hash = assetHashFromRequest(request.url);
    if (!hash) return new Response(null, { status: 404 });

    const cacheDir = path.resolve(getDataDir(), DRAGON_IMAGE_DIR);
    const localPath = path.resolve(cacheDir, `${hash}.png`);
    if (
      localPath !== path.join(cacheDir, `${hash}.png`) ||
      !localPath.startsWith(`${cacheDir}${path.sep}`)
    ) {
      return new Response(null, { status: 404 });
    }

    try {
      const bytes = await fs.promises.readFile(localPath);
      return new Response(bytes, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        logUnexpectedOnce(`dragon-asset://${hash}`, error);
      }
      return new Response(null, { status: 404 });
    }
  });
}

export async function cacheDragonAsset(remoteUrl: string): Promise<string | null> {
  const hash = assetHash(remoteUrl);
  const localPath = assetPath(hash);

  try {
    const stat = await fs.promises.stat(localPath);
    if (stat.isFile() && stat.size > 0) return `${DRAGON_ASSET_SCHEME}://${hash}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logUnexpectedOnce(remoteUrl, error);
      sessionFailures.add(remoteUrl);
      return null;
    }
  }

  if (sessionFailures.has(remoteUrl) || !isAllowedRemoteUrl(remoteUrl)) {
    sessionFailures.add(remoteUrl);
    return null;
  }

  try {
    const response = await fetch(remoteUrl, {
      headers: { "User-Agent": "RiftRecords/1.0.6" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      sessionFailures.add(remoteUrl);
      return null;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
    await fs.promises.writeFile(localPath, bytes);
    return `${DRAGON_ASSET_SCHEME}://${hash}`;
  } catch (error) {
    sessionFailures.add(remoteUrl);
    if (error instanceof TypeError || (error as { name?: string }).name === "TimeoutError") {
      return null;
    }
    logUnexpectedOnce(remoteUrl, error);
    return null;
  }
}
