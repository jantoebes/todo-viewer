import fs from "fs";
import path from "path";
import { DATA_DIR, STATE_DIR as META_DIR } from "../src/lib/paths.ts";
import { LIST_EXTENSION, isValidListName } from "../src/lib/dataStore.ts";
import { loadSyncConfig, saveSyncConfig } from "../src/lib/syncConfig.ts";

function renameIfExists(from: string, to: string): void {
  if (fs.existsSync(from)) fs.renameSync(from, to);
}

function renameStatusKey(oldName: string, newName: string): void {
  const statusPath = path.join(META_DIR, "sync-status.json");
  if (!fs.existsSync(statusPath)) return;
  const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
  if (!status[oldName]) return;
  status[newName] = status[oldName];
  delete status[oldName];
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), "utf8");
}

function renameConfigKey(oldName: string, newName: string): void {
  const configPath = path.join(META_DIR, "config.yaml");
  if (!fs.existsSync(configPath)) return;
  const config = loadSyncConfig();
  if (!config.lists[oldName]) return;
  config.lists[newName] = config.lists[oldName];
  delete config.lists[oldName];
  saveSyncConfig(config);
}

function main(): void {
  const [oldName, newName] = process.argv.slice(2);
  if (!oldName || !newName) throw new Error("Gebruik: rename-list.mts <oud> <nieuw>");
  if (!isValidListName(oldName) || !isValidListName(newName)) throw new Error("Ongeldige lijstnaam");

  const oldDataPath = path.join(DATA_DIR, `${oldName}${LIST_EXTENSION}`);
  const newDataPath = path.join(DATA_DIR, `${newName}${LIST_EXTENSION}`);
  if (!fs.existsSync(oldDataPath)) throw new Error(`data/${oldName}${LIST_EXTENSION} bestaat niet`);
  if (fs.existsSync(newDataPath)) throw new Error(`data/${newName}${LIST_EXTENSION} bestaat al`);

  fs.renameSync(oldDataPath, newDataPath);
  renameIfExists(path.join(META_DIR, `${oldName}-state.json`), path.join(META_DIR, `${newName}-state.json`));
  renameStatusKey(oldName, newName);
  renameConfigKey(oldName, newName);

  console.log(`hernoemd: ${oldName} -> ${newName}`);
}

main();
