import fs from "fs";
import os from "os";
import path from "path";
import { parse, stringify } from "yaml";
import { STATE_DIR } from "./paths.ts";

export interface SyncAccountConfig {
  tenant: string;
  clientIdEnv: string;
}

export interface SyncListConfig {
  account: string;
  displayName?: string;
  folder?: string;
  folderDisplayName?: string;
  groups: Record<string, string>;
  discover?: boolean;
  excludeWellknown?: string[];
  protectedListIds?: string[];
}

export const DEFAULT_EXCLUDE_WELLKNOWN = ["flaggedEmails"];

export interface SyncConfig {
  accounts: Record<string, SyncAccountConfig>;
  lists: Record<string, SyncListConfig>;
  reconcileIntervalMs?: number;
  primaryList?: string;
  activeSyncHost?: string;
}

export const DEFAULT_RECONCILE_INTERVAL_MS = 300_000;

const CONFIG_PATH = path.join(STATE_DIR, "config.yaml");
const EMPTY_CONFIG: SyncConfig = { accounts: {}, lists: {} };

export function loadSyncConfig(): SyncConfig {
  return fs.existsSync(CONFIG_PATH) ? (parse(fs.readFileSync(CONFIG_PATH, "utf8")) as SyncConfig) : EMPTY_CONFIG;
}

export function saveSyncConfig(config: SyncConfig): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, stringify(config), "utf8");
}

// Als de data-map continu tussen meerdere machines wordt gesynct (bv. via Syncthing),
// mag maar één, vast aangewezen machine ook echt met Microsoft Todo praten.
export function isActiveSyncHost(config: SyncConfig): boolean {
  return !config.activeSyncHost || config.activeSyncHost === os.hostname();
}
