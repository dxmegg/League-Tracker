// Imported before everything else in index.ts, so nothing reads a path or the name earlier
import { app } from "electron";
import path from "path";

// The data folder keeps its first name: renaming it would strand every existing database
app.setPath("userData", path.join(app.getPath("appData"), "league-tracker"));
app.setName("Rift Records");
