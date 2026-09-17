import { ipcMain, BrowserWindow, dialog, app, shell } from "electron";
import fs from "fs";
import * as db from "./db";
import * as lcu from "./lcu";
import * as riot from "./riot-api";
import * as dragon from "./dragon";
import * as updater from "./updater";
import * as backup from "./backup";
import * as mcp from "./mcp";
import * as opgg from "./opgg";
import { getBackupDir } from "./paths";
import { openExternalUrl } from "./security";
import { applyAutoStart, isAutoStartSupported } from "./autostart";
import { dbg } from "../shared/debug";

// The settings table doubles as internal bookkeeping — sgp_host, the
// per-account backfill_complete_* flags, score_formula_version — none of which
// the renderer has any business reading or rewriting. Only the keys backing the
// Settings page are exposed.
const RENDERER_SETTINGS = new Set([
  "auto_start",
  "minimize_to_tray",
  "hidden_queues",
  "hide_remakes",
  "auto_backup",
  "remember_filters",
  "theme",
  "riot_game_name",
  "riot_tag_line",
  "riot_platform",
]);

// Registered once for the lifetime of the app — ipcMain.handle throws on a
// second registration for the same channel. Anything needing a window resolves
// it from the sender rather than closing over one, so a window that is replaced
// doesn't leave handlers pointing at a destroyed instance.
function senderWindow(event: { sender: Electron.WebContents }): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

const inFlightRequests = new Map<string, Promise<unknown>>();

function dedupe<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = factory();
  inFlightRequests.set(key, promise);
  const cleanup = () => {
    if (inFlightRequests.get(key) === promise) inFlightRequests.delete(key);
  };
  promise.then(cleanup, cleanup);
  return promise;
}

export function registerIpcHandlers() {
  ipcMain.handle(
    "db:match-history",
    (
      _event,
      limit: number,
      offset: number,
      filters?: {
        championId?: number;
        patch?: string;
        queue?: number;
        account?: string;
        sort?: string;
        sortDir?: string;
        multikills?: string[];
        favorites?: boolean;
      },
    ) => {
      return db.getMatchHistory(limit, offset, filters);
    },
  );

  ipcMain.handle(
    "db:match-filters",
    (
      _event,
      filters?: { championId?: number; patch?: string; queue?: number; account?: string },
    ) => {
      return db.getMatchFilterOptions(filters);
    },
  );

  // Unlike the queue list in db:match-filters, this one ignores the hidden
  // queues — it backs the switches that decide which queues are hidden.
  ipcMain.handle("db:stored-queues", () => {
    return db.getStoredQueues();
  });

  ipcMain.handle("db:match-detail", (_event, gameId: number) => {
    return db.getMatchDetail(gameId);
  });

  ipcMain.handle("db:toggle-favorite", (_event, gameId: number) => {
    return db.toggleFavorite(gameId);
  });

  ipcMain.handle(
    "db:champion-stats",
    (_event, patch?: string, queue?: number, account?: string) => {
      return db.getChampionStatsAll(patch, queue, account);
    },
  );

  ipcMain.handle(
    "db:augment-stats",
    (_event, championId?: number, patch?: string, queue?: number, account?: string) => {
      return db.getAugmentStatsAll(championId, patch, queue, account);
    },
  );

  ipcMain.handle(
    "db:augment-stats-detailed",
    (_event, patch?: string, queue?: number, account?: string) => {
      return db.getAugmentStatsWithChampions(patch, queue, account);
    },
  );

  ipcMain.handle(
    "db:dashboard",
    (
      _event,
      filters?: { championId?: number; patch?: string; queue?: number; account?: string },
    ) => {
      return db.getDashboardData(filters);
    },
  );

  ipcMain.handle(
    "db:most-played-queue",
    (_event, puuid: string, _gameName: string, _tagLine: string) => {
      let result = db.getMostPlayedQueue(puuid);
      const totalRows = db
        .getDatabase()
        .prepare("SELECT COUNT(*) AS n FROM match_participants WHERE puuid = ?")
        .get(puuid) as { n: number };
      console.log("[most-played] puuid:", puuid);
      console.log("[most-played] rows in match_participants:", totalRows.n);
      console.log("[most-played] result:", result);
      return result;
    },
  );

  ipcMain.handle(
    "db:total-matches-played",
    (_event, puuid: string, gameName: string, tagLine: string) => {
      console.log("[total-matches] received:", { puuid, gameName, tagLine });
      const result = db.getTotalMatchesPlayed(puuid);
      console.log("[total-matches] result:", result);
      return result;
    },
  );

  ipcMain.handle("db:ranked-record", (_event, puuid: string) => {
    return db.getRankedRecordForPuuid(puuid);
  });

  ipcMain.handle(
    "db:recent-games",
    (
      _event,
      puuid: string,
      _gameName: string,
      _tagLine: string,
      queueIds: number[],
      limit: number,
    ) => {
      return db.getRecentGames(puuid, queueIds, limit);
    },
  );

  ipcMain.handle(
    "db:champion-match-history",
    (
      _event,
      championId: number,
      limit: number,
      offset: number,
      patch?: string,
      queue?: number,
      account?: string,
    ) => {
      return db.getChampionMatchHistory(championId, limit, offset, patch, queue, account);
    },
  );

  ipcMain.handle("lcu:refresh", async (event) => {
    // Return errors as data instead of throwing, so the renderer gets a clean
    // message rather than Electron's "Error invoking remote method" wrapper
    const win = senderWindow(event);
    try {
      await lcu.pollTick(win!);
      win?.webContents.send("lcu:games-updated");
      return { newGames: 0, totalGames: 0 };
    } catch (err) {
      return { error: lcu.friendlyErrorMessage(err) };
    }
  });

  ipcMain.handle("riot:sync", async (event) => {
    try {
      const result = await riot.syncRiotHistory();
      senderWindow(event)?.webContents.send("lcu:games-updated");
      return result;
    } catch (err) {
      return { error: riot.friendlyRiotError(err, "match") };
    }
  });
  ipcMain.handle(
    "riot:recent-matches",
    async (
      event,
      puuid: string,
      platform: string,
      start: number,
      count: number,
      forceNewest = false,
    ) => {
      const key = `recent:${platform.toLowerCase()}:${puuid}:${start}:${count}:${forceNewest}`;
      return dedupe(key, async () => {
        const win = senderWindow(event);
        riot.setRecentMatchesProgressListener((current, total) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send("riot:recent-matches-progress", { current, total });
          }
        });
        try {
          return await riot.getRecentRiotMatches(puuid, platform, start, count, forceNewest);
        } catch (err) {
          if (err instanceof riot.RiotApiError && err.status === 404) {
            return { matches: [], total: 0 };
          }
          return { error: riot.friendlyRiotError(err, "match") };
        } finally {
          riot.setRecentMatchesProgressListener(null);
        }
      });
    },
  );
  ipcMain.handle(
    "riot:profile",
    async (_event, gameName: string, tagLine: string, platform: string, force = false) => {
      const key = `profile:${platform.toLowerCase()}:${gameName.toLowerCase()}:${tagLine.toLowerCase()}:${force}`;
      return dedupe(key, async () => {
        console.log("[profile] received:", { gameName, tagLine, platform });
        try {
          return await riot.getProfileDataByRiotId(gameName, tagLine, platform, force);
        } catch (err) {
          if (err instanceof riot.RiotApiError && err.status === 404) return null;
          console.error("Failed to load profile:", riot.friendlyRiotError(err, "account"));
          return { error: riot.friendlyRiotError(err, "account") };
        }
      });
    },
  );
  ipcMain.handle("riot:profile-icon", async (_event, puuid: string, platform?: string) => {
    console.log("[riot] profile-icon handler called:", { puuid, platform });
    try {
      const profileIconId = await riot.getProfileIcon(puuid, platform);
      console.log("[riot] profile-icon handler done:", { puuid, profileIconId });
      return profileIconId;
    } catch (err) {
      console.error("[riot] profile-icon handler failed:", err);
      throw err;
    }
  });
  ipcMain.handle(
    "mcp:summoner-game-history",
    async (_event, gameName: string, tagLine: string, region: string) => {
      try {
        return await mcp.fetchSummonerGameHistory(gameName, tagLine, region);
      } catch (err) {
        return { error: err instanceof Error ? err.message : "MCP request failed" };
      }
    },
  );
  ipcMain.handle(
    "opgg:search",
    async (_event, region: string, gameName: string, tagLine: string) => {
      try {
        return await opgg.searchSummoner(region, gameName, tagLine);
      } catch (err) {
        return { error: err instanceof Error ? err.message : "OP.GG search failed" };
      }
    },
  );
  ipcMain.handle("opgg:summary", async (_event, region: string, summonerId: string) => {
    try {
      return await opgg.getSummonerSummary(region, summonerId);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "OP.GG summary failed" };
    }
  });
  ipcMain.handle(
    "opgg:games",
    async (_event, region: string, summonerId: string, limit: number) => {
      try {
        return await opgg.getRecentGames(region, summonerId, limit);
      } catch (err) {
        return { error: err instanceof Error ? err.message : "OP.GG games failed" };
      }
    },
  );
  ipcMain.handle(
    "riot:import-recent",
    async (_event, puuid: string, platform: string, count: number) => {
      try {
        const result = await riot.importRecentRiotMatches(puuid, platform, count);
        console.log("[ipc] import-recent result:", result);
        console.log("[ipc] tracked rows for", puuid, db.getTrackedRowCountForPuuid(puuid));
        return result;
      } catch (err) {
        return { error: riot.friendlyRiotError(err, "match") };
      }
    },
  );
  ipcMain.handle("riot:accounts", () => riot.getRiotAccounts());
  ipcMain.handle("riot:save-account", (_event, account) => riot.saveRiotAccount(account));
  ipcMain.handle("riot:remove-account", (_event, id: string) => riot.removeRiotAccount(id));

  ipcMain.handle("lcu:backfill", async (event, forceFull = false) => {
    try {
      return await lcu.backfillHistory(senderWindow(event), forceFull);
    } catch (err) {
      return { error: lcu.friendlyErrorMessage(err) };
    }
  });

  ipcMain.handle("backfill:sync-account", async (event, puuid: string) => {
    console.log("[backfill] sync-account requested:", { puuid });
    try {
      const snapshot = db.getAccountSnapshot(puuid);
      if (!snapshot) {
        return { ok: false, error: "Account not found in local cache" };
      }
      if (!snapshot.gameName || !snapshot.platform) {
        return {
          ok: false,
          error: "Account has no cached identity — log in with it once in League Client",
        };
      }

      await lcu.backfillHistoryForAccount(
        {
          puuid: snapshot.puuid,
          gameName: snapshot.gameName,
          tagLine: snapshot.tagLine ?? "",
          platform: snapshot.platform,
        },
        senderWindow(event),
        false,
      );
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[backfill] sync-account failed:", message);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("lcu:cancel-backfill", () => {
    lcu.cancelBackfill();
  });

  ipcMain.handle("lcu:backfill-running", () => {
    return lcu.isBackfillRunning();
  });

  ipcMain.handle("lcu:status", () => {
    return lcu.getStatus();
  });

  ipcMain.handle("lcu:current-puuid", async () => {
    console.log("[lcu] current puuid handler called:", {});
    if (!lcu.isClientConnected()) {
      console.log("[lcu] current puuid handler done:", { puuid: null, connected: false });
      return null;
    }

    try {
      const summoner = await lcu.getCurrentSummoner();
      const puuid = summoner.puuid || null;
      console.log("[lcu] current puuid handler done:", { puuid, connected: true });
      return puuid;
    } catch (err) {
      console.warn("[lcu] current puuid unavailable:", err);
      return null;
    }
  });

  ipcMain.handle("lcu:current-summoner-icon", async () => {
    console.log("[lcu] currentSummonerProfileIcon called:", {});
    try {
      const summoner = await lcu.getCurrentSummoner();
      const profileIconId =
        typeof summoner?.profileIconId === "number" && summoner.profileIconId > 0
          ? summoner.profileIconId
          : null;
      console.log("[lcu] currentSummonerProfileIcon done:", { profileIconId });
      return profileIconId;
    } catch (err) {
      console.warn("[lcu] currentSummonerProfileIcon failed:", err);
      return null;
    }
  });

  ipcMain.handle("lcu:current-summoner", async () => {
    console.log("[lcu] currentSummoner handler called:", {});
    const result = await lcu.getCurrentSummoner();
    console.log("[lcu] currentSummoner handler done:", {
      puuid: result.puuid,
      summonerLevel: result.summonerLevel,
      profileIconId: result.profileIconId,
      platform: result.platform,
    });
    void lcu.collectAndSaveSnapshot().catch((err) => {
      console.warn("[lcu-watcher] explicit summoner snapshot failed:", err);
    });
    return result;
  });

  ipcMain.handle("lcu:profile-extras", async () => {
    console.log("[lcu] profileExtras handler called:", {});
    const result = await lcu.getProfileExtras();
    console.log("[lcu] profileExtras handler done:", {
      hasRankedSolo: Boolean(result.rankedSolo),
      hasRankedFlex: Boolean(result.rankedFlex),
      masteryCount: result.topMasteryChampions.length,
    });
    void lcu.collectAndSaveSnapshot().catch((err) => {
      console.warn("[lcu-watcher] explicit extras snapshot failed:", err);
    });
    return result;
  });

  ipcMain.handle("dragon:champions", async () => {
    await dragon.waitForChampionData();
    return dragon.getChampionData();
  });

  ipcMain.handle("dragon:version", async () => {
    console.log("[dragon] championDataVersion called:", {});
    await dragon.waitForChampionData();
    const version = dragon.getChampionDataVersion();
    console.log("[dragon] championDataVersion done:", { version });
    return version;
  });

  ipcMain.handle("dragon:augments", async (_event, patch?: string) => {
    try {
      return await dragon.loadAugmentData(patch);
    } catch {
      return {};
    }
  });

  ipcMain.handle("dragon:augment-icon", async (_event, id: number, patch?: string) => {
    try {
      return await dragon.resolveAugmentIcon(id, patch);
    } catch {
      return null;
    }
  });

  ipcMain.handle("dragon:items", async (_event, patch?: string) => {
    try {
      return await dragon.loadItemData(patch);
    } catch {
      return {};
    }
  });

  ipcMain.handle("dragon:summoner-spells", async () => {
    try {
      return await dragon.loadSummonerSpellData();
    } catch {
      return {};
    }
  });
  ipcMain.handle("dragon:runes", async () => {
    try {
      return await dragon.loadRuneData();
    } catch {
      return {};
    }
  });
  ipcMain.handle("dragon:rune-trees", async () => {
    try {
      return await dragon.loadRuneTreeLayout();
    } catch {
      return {};
    }
  });

  ipcMain.handle(
    "db:champion-item-stats",
    (_event, championId: number, patch?: string, queue?: number) => {
      return db.getChampionItemStats(championId, patch, queue);
    },
  );

  ipcMain.handle(
    "db:teammate-stats",
    (_event, queue?: number, relation?: "friends" | "enemies") => {
      return db.getTeammateStats(queue, relation);
    },
  );

  ipcMain.handle(
    "db:teammate-detail",
    async (_event, key: string, queue?: number, relation?: "friends" | "enemies") => {
      // Teammate scores are computed on the fly and need champion classes
      await dragon.waitForChampionData();
      return db.getTeammateDetail(key, queue, relation);
    },
  );

  ipcMain.handle("db:global-stats", (_event, patch?: string, queue?: number) => {
    return db.getGlobalStats(patch, queue);
  });
  ipcMain.handle(
    "db:owned-item-stats",
    (_event, patch?: string, queue?: number, account?: string) => {
      return db.getOwnedItemStats(patch, queue, account);
    },
  );
  ipcMain.handle("db:owned-rune-stats", (_event, queue?: number, patch?: string) => {
    return db.getOwnedRuneStats(queue, patch);
  });
  ipcMain.handle(
    "db:owned-item-detail",
    (_event, itemId: number, patch?: string, queue?: number) => {
      return db.getOwnedItemDetail(itemId, patch, queue);
    },
  );

  ipcMain.handle("db:trends", (_event, queue?: number, account?: string) => {
    return db.getTrendsData(queue, account);
  });

  ipcMain.handle("db:records", (_event, queue?: number, account?: string) => {
    return db.getRecords(queue, account);
  });

  ipcMain.handle(
    "db:global-champion-detail",
    (_event, championId: number, patch?: string, queue?: number) => {
      return db.getGlobalChampionDetail(championId, patch, queue);
    },
  );

  ipcMain.handle("db:all-summoner-puuids", () => {
    return db.getAllPuuids();
  });

  ipcMain.handle("db:list-accounts", () => {
    console.log("[db] list accounts handler called:", {});
    const result = db.listAccountsWithData();
    console.log("[db] list accounts handler done:", { count: result.length });
    return result;
  });

  ipcMain.handle("db:get-account-snapshot", (_event, puuid: string) => {
    console.log("[db] get account snapshot handler called:", { puuid });
    const result = db.getAccountSnapshot(puuid);
    console.log("[db] get account snapshot handler done:", {
      puuid,
      found: result !== null,
    });
    return result;
  });

  ipcMain.handle("db:saved-summoners", () => {
    return db.listSavedSummoners();
  });

  ipcMain.handle("db:delete-summoner", async (event, puuid: string) => {
    await backup.backupQuietly("pre-import");
    const result = db.deleteSavedSummoner(puuid);
    senderWindow(event)?.webContents.send("lcu:games-updated");
    return result;
  });

  ipcMain.handle("db:delete-searched-summoners", async (event) => {
    await backup.backupQuietly("pre-import");
    const result = db.deleteSearchedSummoners();
    senderWindow(event)?.webContents.send("lcu:games-updated");
    return result;
  });

  ipcMain.handle("db:restore-older-games", () => db.restoreOlderGames());

  ipcMain.handle("db:summoner-puuid", () => {
    const s = db.getSummoner();
    return s?.puuid ?? null;
  });

  ipcMain.handle("db:profile", () => {
    return db.getProfile();
  });

  // Settings
  ipcMain.handle("settings:get", (_event, key: string) => {
    if (!RENDERER_SETTINGS.has(key)) return null;
    return db.getSetting(key);
  });

  ipcMain.handle("settings:set", (_event, key: string, value: string) => {
    if (!RENDERER_SETTINGS.has(key)) {
      console.warn("Refused to write non-renderer setting:", key);
      return;
    }
    db.setSetting(key, value);

    // The one setting with a home outside the database: the login item has to be
    // rewritten to match, and only this handler knows the answer just changed.
    if (key === "auto_start") applyAutoStart(value === "true");
  });
  ipcMain.handle("dbg:get", () => {
    const enabled = db.getSetting("debug_enabled") === "true";
    dbg.setEnabled(enabled);
    return enabled;
  });
  ipcMain.handle("dbg:set", (_event, enabled: boolean) => {
    const value = enabled === true;
    db.setSetting("debug_enabled", String(value));
    dbg.setEnabled(value);
  });

  // Auto-start registers the app by its own path, which an unpackaged run does
  // not have — the Settings page reads this to say so rather than offering a
  // switch that would quietly do nothing.
  ipcMain.handle("autostart:supported", () => isAutoStartSupported());

  // Window controls (custom title bar). The maximize/unmaximize events that
  // pair with these are wired up in createWindow, where the window lives.
  ipcMain.handle("window:minimize", (event) => {
    senderWindow(event)?.minimize();
  });

  ipcMain.handle("window:toggle-maximize", (event) => {
    const win = senderWindow(event);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  ipcMain.handle("window:close", (event) => {
    senderWindow(event)?.close();
  });

  ipcMain.handle("window:is-maximized", (event) => {
    return senderWindow(event)?.isMaximized() ?? false;
  });

  // Version & updates
  ipcMain.handle("app:version", () => {
    return app.getVersion();
  });

  ipcMain.handle("app:check-update", () => {
    return updater.checkForUpdate();
  });

  ipcMain.handle("app:download-update", (event, assetUrl: string) => {
    const win = senderWindow(event);
    if (!win) return { success: false, error: "No window to report progress to" };
    return updater.downloadAndInstall(win, assetUrl);
  });

  ipcMain.handle("app:open-url", (_event, url: string) => {
    openExternalUrl(url);
  });

  // Data export/import
  ipcMain.handle("data:export", async (event) => {
    const win = senderWindow(event);
    const options = {
      title: "Export Mayhem Data",
      defaultPath: `mayhem-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    };
    // Parented to the window when there is one, so the dialog is modal
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { success: false };
    try {
      const games = await db.writeExportTo(result.filePath);
      return { success: true, path: result.filePath, games };
    } catch (err: any) {
      // A partial file would still look like a backup, so don't leave one
      try {
        fs.rmSync(result.filePath, { force: true });
      } catch {
        /* nothing more we can do */
      }
      return { success: false, error: `Export failed: ${err.message}` };
    }
  });

  ipcMain.handle("data:import", async (event) => {
    const win = senderWindow(event);
    const options = {
      title: "Import Mayhem Data",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile" as const],
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return { success: false };
    // Anything can be chosen in that dialog, so unreadable files, malformed
    // JSON and well-formed JSON that isn't a backup all have to come back as
    // messages rather than as a thrown "Error invoking remote method".
    try {
      const raw = await fs.promises.readFile(result.filePaths[0], "utf-8");
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || !Array.isArray(data.games)) {
        return { success: false, error: "That file isn't a Mayhem Tracker backup" };
      }
      // Snapshot first: an import writes into every table, and this is the last
      // moment the database is known to be in the state the user chose it from.
      await backup.backupQuietly("pre-import");
      const imported = db.importData(data);
      return { success: true, imported };
    } catch (err: any) {
      const reason = err instanceof SyntaxError ? "it isn't valid JSON" : err.message;
      return { success: false, error: `Import failed: ${reason}` };
    }
  });

  ipcMain.handle("data:repair-puuids", async () => {
    // Repair rescoring needs champion classes; wait so a repair triggered
    // right after launch doesn't score with default weights.
    await dragon.waitForChampionData();
    // A repair reassigns game ownership and rewrites every derived stat, so
    // there is no undo for it short of the snapshot taken here.
    await backup.backupQuietly("pre-repair");
    return db.repairPuuids();
  });

  ipcMain.handle("db:has-local-account", () => {
    return db.getAllPuuids().length > 0;
  });

  // Backups
  ipcMain.handle("backup:list", () => {
    return backup.listBackups();
  });

  ipcMain.handle("backup:create", async () => {
    try {
      return { success: true, backup: await backup.createBackup("manual") };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("backup:restore", async (event, file: string) => {
    try {
      const result = await backup.restoreBackup(file);
      // Everything on screen was read from the database that just got replaced
      senderWindow(event)?.webContents.send("lcu:games-updated");
      return { success: true, games: result.games };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("backup:recovery-report", () => {
    return backup.getRecoveryReport();
  });

  // No renderer input reaches this: the path is ours, and the folder is the
  // one place a user needs to reach to copy a backup somewhere safer.
  ipcMain.handle("backup:open-folder", () => {
    void shell.openPath(getBackupDir());
  });
}
