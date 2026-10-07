import fs from "fs";
import path from "path";
import { STATE_DIR as META_DIR } from "./paths.ts";

export interface SyncedItem {
  title: string;
  status: string;
  msftId: string;
}

export interface GroupState {
  items: SyncedItem[];
  deltaLink?: string;
}

export type SyncState = Record<string, GroupState>;

function statePath(listName: string): string {
  return path.join(META_DIR, `${listName}-state.json`);
}

export function loadState(listName: string): SyncState {
  const target = statePath(listName);
  return fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, "utf8")) : {};
}

// Alleen schrijven als de inhoud echt verandert: de pull draait elke 45s en een onnodige
// write geeft Syncthing elke keer een "gewijzigd" bestand om te verspreiden.
export function saveState(listName: string, state: SyncState): void {
  const target = statePath(listName);
  const content = JSON.stringify(state, null, 2);
  if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === content) return;
  fs.mkdirSync(META_DIR, { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}
