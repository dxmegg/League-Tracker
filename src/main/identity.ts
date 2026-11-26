// Imported before everything else in index.ts, so nothing reads a path or the name earlier
import { app } from "electron";
import path from "path";
import { resolveUserDataDir } from "./storage-files";

// A dev build gets its own profile: it must never rename the installed program's folder
const appData = app.getPath("appData");
app.setPath(
  "userData",
  app.isPackaged ? resolveUserDataDir(appData) : path.join(appData, "rift-records-dev"),
);
app.setName("Rift Records");
