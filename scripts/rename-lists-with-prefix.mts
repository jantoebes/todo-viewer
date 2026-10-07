import { loadSyncConfig } from "../src/lib/syncConfig.ts";
import { acquireToken, createClient, loadEnvLocal, requireClientId } from "./msftAuth.mts";
import { renameList } from "./msftTodoClient.mts";

async function main(): Promise<void> {
  loadEnvLocal();
  const pca = createClient(requireClientId());
  const token = await acquireToken(pca);
  const config = loadSyncConfig();

  for (const [listName, listConfig] of Object.entries(config.lists)) {
    const prefix = listConfig.displayName ?? listName;
    for (const [group, todoListId] of Object.entries(listConfig.groups)) {
      const displayName = `${prefix} · ${group}`;
      await renameList(token.accessToken, todoListId, displayName);
      console.log(`hernoemd: ${displayName}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
