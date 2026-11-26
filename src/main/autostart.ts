import { app } from "electron";
import fs from "fs";
import path from "path";
import { getSetting, setSetting } from "./db";

// Auto-start exists so the poller keeps recording games, not so a window lands
// in front of whatever the user signed in to do, so the login item always asks
// for the tray.
export const HIDDEN_FLAG = "--hidden";

// The installer cannot pass arguments to the program it restarts, so an update that happens
// while the program sits in the tray leaves a note for the next start
const hiddenNote = () => path.join(app.getPath("userData"), "start-hidden");
const NOTE_MAX_AGE_MS = 10 * 60_000;

export function leaveStartHiddenNote(): void {
  fs.writeFileSync(hiddenNote(), "");
}

export function takeStartHiddenNote(): boolean {
  try {
    const age = Date.now() - fs.statSync(hiddenNote()).mtimeMs;
    fs.rmSync(hiddenNote());
    return age < NOTE_MAX_AGE_MS;
  } catch {
    return false;
  }
}

// Only the installed program has a durable exe to register
function installedExe(): string | null {
  return process.platform === "win32" && app.isPackaged ? process.execPath : null;
}

// False in dev and in any unpackaged run
export function isAutoStartSupported(): boolean {
  return installedExe() !== null;
}

export function applyAutoStart(enabled: boolean): void {
  const exe = installedExe();
  if (!exe) return;

  // The registry entry is derived state: `auto_start` holds the user's answer
  // and `auto_start_path` records the exe last registered, so a launch can tell
  // whether the entry still points at where the exe lives now.
  const registered = getSetting("auto_start_path");
  // Deliberately narrow. setLoginItemSettings also resets the startup-approved
  // key, so rewriting an entry that is already correct would silently undo a
  // user who switched the app off in Task Manager's Startup tab.
  if (enabled ? registered === exe : !registered) return;

  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: exe,
      args: [HIDDEN_FLAG],
      // The registry value name from the first versions. Changing it would leave the old entry
      // behind, still starting the program after the switch is turned off.
      name: "league-tracker",
    });
    setSetting("auto_start_path", enabled ? exe : "");
  } catch (err) {
    // Costs auto-start, never the launch. The recorded path stays stale, so the
    // next start tries again.
    console.error("Failed to update the login item:", err);
  }
}

// The program can be installed somewhere else, or still be registered as the old portable
// exe. Re-registering on each launch keeps the entry current.
export function syncAutoStart(): void {
  applyAutoStart(getSetting("auto_start") === "true");
}
