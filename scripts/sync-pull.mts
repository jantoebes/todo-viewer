import { loadSyncConfig, isActiveSyncHost } from "../src/lib/syncConfig.ts";
import { acquireToken, createClient, loadEnvLocal, requireClientId } from "./msftAuth.mts";
import { pullList } from "./syncPull.mts";

const listName = process.argv[2] ?? "_msft-todo";

async function main(): Promise<void> {
  loadEnvLocal();
  const config = loadSyncConfig();
  if (!isActiveSyncHost(config)) {
    throw new Error(`Dit is niet de aangewezen sync-host (${config.activeSyncHost}).`);
  }
  const pca = createClient(requireClientId());
  const token = await acquireToken(pca);
  const changed = await pullList(token.accessToken, listName, config);
  console.log(changed ? `sync-pull klaar (${listName}), wijzigingen toegepast.` : `sync-pull klaar (${listName}), geen wijzigingen.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
