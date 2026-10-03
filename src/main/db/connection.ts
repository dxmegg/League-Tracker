import path from "path";
import { getDataDir } from "../paths";

export function getDbPath() {
  return path.join(getDataDir(), "matches.db");
}
