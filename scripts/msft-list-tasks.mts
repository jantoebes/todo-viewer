import { acquireToken, createClient, loadEnvLocal, requireClientId } from "./msftAuth.mts";

async function fetchTasks(accessToken: string, listId: string): Promise<unknown> {
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/todo/lists/${listId}/tasks`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.json();
}

async function main(): Promise<void> {
  loadEnvLocal();
  const listId = process.argv[2] ?? (() => { throw new Error("Geef een list id als argument"); })();
  const pca = createClient(requireClientId());
  const token = await acquireToken(pca);
  const tasks = await fetchTasks(token.accessToken, listId);
  console.log(JSON.stringify(tasks, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
