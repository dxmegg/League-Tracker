// One-off converter for legacy League Tracker exports (v3/v4/v5) to the
// current v6 NDJSON gzip format. Run once, then import the output via
// Settings → Data Management → Import.
//   node scripts/convert-legacy-export.mjs <input.json> <output.json.gz>

import fs from "node:fs";
import { createReadStream, createWriteStream } from "node:fs";
import { once } from "node:events";
import { createGzip } from "node:zlib";
import { parser } from "stream-json";
import { pick } from "stream-json/filters/pick.js";
import { streamArray } from "stream-json/streamers/stream-array.js";

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/convert-legacy-export.mjs <input.json> <output.json.gz>");
  process.exitCode = 1;
} else {
  const counts = new Map();

  function increment(type) {
    const count = (counts.get(type) ?? 0) + 1;
    counts.set(type, count);
    if (count % 10_000 === 0) {
      console.error(`${type} ${count} written`);
    }
  }

  async function readVersion() {
    const stream = createReadStream(inputPath)
      .pipe(parser.asStream())
      .pipe(pick.asStream({ filter: "version" }));
    let version;
    for await (const token of stream) {
      if (token.name === "numberValue") version = Number(token.value);
    }
    if (!Number.isInteger(version)) throw new Error("Legacy export has no integer version");
    return version;
  }

  function streamArrayAt(key) {
    return createReadStream(inputPath)
      .pipe(parser.asStream())
      .pipe(pick.asStream({ filter: key }))
      .pipe(streamArray.asStream());
  }

  async function writeLine(gzip, record) {
    const line = `${JSON.stringify(record)}\n`;
    if (!gzip.write(line)) await once(gzip, "drain");
  }

  async function streamRecords(gzip, key, type) {
    try {
      for await (const item of streamArrayAt(key)) {
        await writeLine(gzip, { type, data: item.value });
        increment(type);
      }
    } catch (error) {
      error.message = `Failed while streaming ${key}: ${error.message}`;
      throw error;
    }
  }

  async function convert() {
    const version = await readVersion();
    console.error(`Legacy export version: ${version}`);

    const output = createWriteStream(outputPath);
    const gzip = createGzip();
    gzip.pipe(output);

    try {
      await writeLine(gzip, { type: "header", version: 6, exportedAt: Date.now() });
      await streamRecords(gzip, "summoners", "summoner");
      await streamRecords(gzip, "settings", "setting");
      await streamRecords(gzip, "ignoredGames", "ignoredGame");
      await streamRecords(gzip, "riotSyncState", "riotSyncState");
      await streamRecords(gzip, "games", "game");
      await streamRecords(gzip, "timelineStatus", "timelineStatus");
      await streamRecords(gzip, "timelineFrames", "timelineFrame");
      await streamRecords(gzip, "timelineEvents", "timelineEvent");
      gzip.end();
      await once(output, "finish");
    } catch (error) {
      gzip.destroy();
      output.destroy();
      throw error;
    }

    const { size } = await fs.promises.stat(outputPath);
    console.error("Conversion complete.");
    for (const [type, count] of counts) console.error(`${type}: ${count}`);
    console.error(`Output size: ${(size / (1024 * 1024)).toFixed(2)} MB`);
  }

  convert().catch((error) => {
    console.error(`Conversion failed: ${error.message}`);
    process.exitCode = 1;
  });
}
