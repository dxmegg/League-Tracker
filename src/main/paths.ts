import path from "path";
import fs from "fs";
import { app } from "electron";
import { readLocations, writeLocations, type Locations } from "./storage-files";

// In development, use the project's data directory
// In production, use app.getPath('userData')
export function getRootDir() {
  const isDev = !app.isPackaged;
  return isDev ? path.join(__dirname, "..", "..") : app.getPath("userData");
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

const locationsFile = () => path.join(getRootDir(), "locations.json");

export const getLocations = () => readLocations(locationsFile());
export const setLocations = (locations: Locations) => writeLocations(locationsFile(), locations);

// Caches (game art, champion data) always live here; only the database and its backups can move
export function getDataDir() {
  return ensureDir(path.join(getRootDir(), "data"));
}

// A folder the user picked is not created here: if its drive is missing the program has to say
// so rather than start an empty database somewhere
export function getDbDir() {
  return getLocations().dbDir ?? getDataDir();
}

// Inside the database folder unless the user picked another one
export function getBackupDir() {
  const dir = getLocations().backupDir ?? path.join(getDbDir(), "backups");
  try {
    return ensureDir(dir);
  } catch {
    // Its drive is missing: listing comes up empty and writing a backup reports the error
    return dir;
  }
}

// Where backups were kept before they moved into the database folder
export function getLegacyBackupDir() {
  return path.join(getRootDir(), "backups");
}
