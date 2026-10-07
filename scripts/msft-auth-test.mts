import { acquireToken, createClient, loadEnvLocal, requireClientId } from "./msftAuth.mts";

async function fetchTodoLists(accessToken: string): Promise<unknown> {
  const response = await fetch("https://graph.microsoft.com/v1.0/me/todo/lists", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.json();
}

async function main(): Promise<void> {
  loadEnvLocal();
  const pca = createClient(requireClientId());
  const token = await acquireToken(pca);
  const lists = await fetchTodoLists(token.accessToken);
  console.log(JSON.stringify(lists, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
