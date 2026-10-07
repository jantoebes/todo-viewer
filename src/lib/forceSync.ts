import fs from "fs";
import path from "path";
import { loadSyncConfig } from "./syncConfig";
import { loadSyncStatus, SYNC_TRIGGER_FILE } from "./syncStatus";
import { STATE_DIR } from "./paths";

const TRIGGER_PATH = path.join(STATE_DIR, SYNC_TRIGGER_FILE);
const POLL_INTERVAL_MS = 1000;
const TIMEOUT_MS = 180_000;

function writeTrigger(requestedAt: string): void {
  fs.writeFileSync(TRIGGER_PATH, JSON.stringify({ requestedAt }), "utf8");
}

function reconciledSince(listName: string, requestedAt: string): boolean {
  const status = loadSyncStatus()[listName];
  return (status?.lastReconcileAt ?? "") >= requestedAt || status?.lastError !== undefined;
}

function describe(listName: string): string {
  const status = loadSyncStatus()[listName];
  return status?.lastError ?? `gereconcilieerd om ${status?.lastReconcileAt}`;
}

function waitUntil(done: () => boolean, deadline: number): Promise<boolean> {
  return new Promise((resolve) => {
    const check = () =>
      done() ? resolve(true) : Date.now() > deadline ? resolve(false) : setTimeout(check, POLL_INTERVAL_MS);
    check();
  });
}

export async function forceFullSync(): Promise<Record<string, string>> {
  const listNames = Object.keys(loadSyncConfig().lists);
  const requestedAt = new Date().toISOString();
  writeTrigger(requestedAt);
  const finished = await waitUntil(
    () => listNames.every((name) => reconciledSince(name, requestedAt)),
    Date.now() + TIMEOUT_MS
  );
  return Object.fromEntries(
    listNames.map((name) => [name, finished ? describe(name) : "timeout — sync-watch draait mogelijk niet"])
  );
}
