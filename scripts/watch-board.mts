import fs from "fs";
import path from "path";
import { DATA_DIR } from "../src/lib/paths.ts";
import { LIST_EXTENSION, readBoardData, writeBoardData, wasLastWrittenByUs } from "../src/lib/dataStore.ts";

const DEBOUNCE_MS = 150;

function reformat(list: string): void {
  const target = path.join(DATA_DIR, `${list}${LIST_EXTENSION}`);
  if (!fs.existsSync(target)) return;
  const raw = fs.readFileSync(target, "utf8");
  if (wasLastWrittenByUs(list, raw)) return;
  try {
    writeBoardData(list, readBoardData(list));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[watch-board] kon ${list}${LIST_EXTENSION} niet formatteren: ${message}`);
  }
}

process.on("uncaughtException", (err) => {
  console.error(`[watch-board] onverwachte fout: ${err.message}`);
});

fs.mkdirSync(DATA_DIR, { recursive: true });

const timers = new Map<string, ReturnType<typeof setTimeout>>();

fs.watch(DATA_DIR, (_event, filename) => {
  if (!filename || !filename.endsWith(LIST_EXTENSION)) return;
  const list = filename.slice(0, -LIST_EXTENSION.length);
  const existing = timers.get(list);
  if (existing) clearTimeout(existing);
  timers.set(list, setTimeout(() => reformat(list), DEBOUNCE_MS));
});

console.log(`[watch-board] watching all *${LIST_EXTENSION} files in ${DATA_DIR}`);
