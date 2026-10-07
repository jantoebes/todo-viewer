import { loadSyncConfig, isActiveSyncHost } from "../src/lib/syncConfig.ts";
import { acquireToken, createClient, loadEnvLocal, requireClientId } from "./msftAuth.mts";
import { pushList } from "./syncPush.mts";

const listName = process.argv[2] ?? "_msft-todo";

async function main(): Promise<void> {
  loadEnvLocal();
  const config = loadSyncConfig();
  if (!isActiveSyncHost(config)) {
    throw new Error(`Dit is niet de aangewezen sync-host (${config.activeSyncHost}).`);
  }
  const pca = createClient(requireClientId());
  const token = await acquireToken(pca);
  await pushList(token.accessToken, listName, config);
  console.log(`sync-push klaar (${listName}).`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
