import path from "path";
import { getDbDir } from "../paths";
import { DB_FILE } from "../storage-files";

export function getDbPath() {
  return path.join(getDbDir(), DB_FILE);
}
