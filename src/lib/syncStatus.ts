import fs from "fs";
import path from "path";
import { loadSyncConfig } from "./syncConfig.ts";
import { STATE_DIR } from "./paths.ts";

export interface ListSyncStatus {
  lastPushAt?: string;
  lastPullAt?: string;
  lastReconcileAt?: string;
  lastChangeAt?: string;
  lastError?: string;
}

export type SyncStatus = Record<string, ListSyncStatus>;

export const SYNC_TRIGGER_FILE = "sync-trigger.json";

const STATUS_PATH = path.join(STATE_DIR, "sync-status.json");

export function loadSyncStatus(): SyncStatus {
  return fs.existsSync(STATUS_PATH) ? JSON.parse(fs.readFileSync(STATUS_PATH, "utf8")) : {};
}

export function updateSyncStatus(listName: string, patch: Partial<ListSyncStatus>): void {
  const lists = loadSyncConfig().lists;
  // Lijsten die niet meer in de config staan (hernoemd/verwijderd) opruimen.
  const status = Object.fromEntries(Object.entries(loadSyncStatus()).filter(([name]) => name in lists));
  status[listName] = { ...status[listName], ...patch };
  fs.mkdirSync(path.dirname(STATUS_PATH), { recursive: true });
  fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), "utf8");
}
