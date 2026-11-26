import { app, shell } from "electron";
import fs from "fs";
import path from "path";

// Must match the id passed to app.setAppUserModelId and the appId in package.json
const APP_USER_MODEL_ID = "com.dxmegg.leaguetracker";

// The installer makes the shortcuts now. The portable versions left one under the old project
// name, which would still point at their exe.
export function removeOldShortcut() {
  if (process.platform !== "win32" || !app.isPackaged) return;
  const link = path.join(
    app.getPath("appData"),
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "league-tracker.lnk",
  );
  try {
    if (shell.readShortcutLink(link).appUserModelId === APP_USER_MODEL_ID) fs.rmSync(link);
  } catch {
    // Not there, which is the normal case
  }
}
