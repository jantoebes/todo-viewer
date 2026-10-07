import fs from "fs";
import path from "path";
import { DATA_DIR } from "../src/lib/paths.ts";

const FILENAME = ".DS_Store";
const SWEEP_INTERVAL_MS = 60_000;
const SKIPPED_DIRECTORY_NAMES = ["node_modules", ".git", ".next"];

function isSkippedDirectory(name: string): boolean {
  return SKIPPED_DIRECTORY_NAMES.includes(name);
}

async function sweepDirectory(dir: string): Promise<string[]> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const removed: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory() && !isSkippedDirectory(entry.name)) {
      const nested = await sweepDirectory(entryPath);
      removed.push(...nested);
    } else if (entry.isFile() && entry.name === FILENAME) {
      await fs.promises.rm(entryPath, { force: true });
      removed.push(entryPath);
    }
  }

  return removed;
}

async function sweepOnce(root: string): Promise<void> {
  try {
    const removed = await sweepDirectory(root);
    if (removed.length > 0) {
      console.log(`[ds-store-cleanup] ${removed.length} ${FILENAME}-bestand(en) verwijderd onder ${root}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ds-store-cleanup] fout tijdens opruimen onder ${root}: ${message}`);
  }
}

const root = DATA_DIR;

sweepOnce(root).then(() => console.log(`[ds-store-cleanup] eerste sweep klaar, houdt ${root} vrij van ${FILENAME}`));
setInterval(() => sweepOnce(root), SWEEP_INTERVAL_MS);
