// Export, import, restore and account deletion on a throwaway database:  npm test
// better-sqlite3 is built for Electron, so the database code is bundled with Vite and run by
// Electron's own Node (ELECTRON_RUN_AS_NODE), with a stub in place of the Electron API.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import electron from "electron";
import { build } from "vite";

const root = path.resolve(import.meta.dirname, "..");
// Under node_modules so its imports resolve, and outside out/, which the installer packs
const outDir = path.join(root, "node_modules", ".cache", "transfer-test");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "rr-transfer-"));
try {
  await build({
    configFile: false,
    logLevel: "warn",
    root,
    resolve: { alias: { electron: path.join(root, "scripts/transfer-test/electron-stub.ts") } },
    build: {
      ssr: path.join(root, "scripts/transfer-test/run.ts"),
      outDir,
      emptyOutDir: true,
      target: "node22",
      minify: false,
      rollupOptions: { output: { format: "es", entryFileNames: "run.mjs" } },
    },
  });
  const result = spawnSync(electron, ["--no-deprecation", path.join(outDir, "run.mjs")], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", RR_TEST_DIR: work },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  // The database code logs every step; only worth reading when something failed
  if (result.status !== 0) console.error(result.stdout, result.stderr, result.error ?? "");
  assert.equal(result.status, 0, "transfer test failed");
  console.log("transfer checks passed");
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
