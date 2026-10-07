import { loadSyncConfig, isActiveSyncHost } from "../src/lib/syncConfig.ts";
import { acquireToken, createClient, loadEnvLocal, requireClientId } from "./msftAuth.mts";
import { fullReconcileList } from "./syncPull.mts";
import { updateSyncStatus } from "../src/lib/syncStatus.ts";

const listName = process.argv[2] ?? "_msft-todo";

async function main(): Promise<void> {
  loadEnvLocal();
  const config = loadSyncConfig();
  if (!isActiveSyncHost(config)) {
    throw new Error(`Dit is niet de aangewezen sync-host (${config.activeSyncHost}).`);
  }
  const pca = createClient(requireClientId());
  const token = await acquireToken(pca);
  const changed = await fullReconcileList(token.accessToken, listName, config);
  const now = new Date().toISOString();
  updateSyncStatus(listName, changed ? { lastReconcileAt: now, lastChangeAt: now, lastError: undefined } : { lastReconcileAt: now, lastError: undefined });
  console.log(changed ? `sync-reconcile klaar (${listName}), wijzigingen toegepast.` : `sync-reconcile klaar (${listName}), geen wijzigingen.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
