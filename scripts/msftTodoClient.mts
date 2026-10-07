const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_BETA = "https://graph.microsoft.com/beta";

export class GraphError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string, body: string) {
    super(`Graph ${status} op ${url}: ${body.slice(0, 300)}`);
    this.status = status;
    this.url = url;
  }
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
}

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

function isTransient(status: number, method: string): boolean {
  return status === 429 || (status >= 500 && method !== "POST");
}

function retryDelayMs(res: Response, attempt: number): number {
  const retryAfterSeconds = Number(res.headers.get("Retry-After"));
  return Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? retryAfterSeconds * 1000
    : BASE_BACKOFF_MS * 2 ** attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function graphFetch(accessToken: string, url: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
  const res = await fetch(url, { ...init, headers: authHeaders(accessToken) });
  return res.ok
    ? res
    : isTransient(res.status, init.method ?? "GET") && attempt < MAX_RETRIES
      ? sleep(retryDelayMs(res, attempt)).then(() => graphFetch(accessToken, url, init, attempt + 1))
      : Promise.reject(new GraphError(res.status, url, await res.text()));
}

async function graphJson(accessToken: string, url: string, init: RequestInit = {}): Promise<any> {
  return (await graphFetch(accessToken, url, init)).json();
}

async function graphDelete(accessToken: string, url: string): Promise<Response> {
  return graphFetch(accessToken, url, { method: "DELETE" }).catch((err) =>
    err instanceof GraphError && err.status === 404 ? new Response(null, { status: 204 }) : Promise.reject(err)
  );
}

function jsonBody(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

async function fetchAllPages(accessToken: string, url: string): Promise<any[]> {
  const json = await graphJson(accessToken, url);
  const rest = json["@odata.nextLink"] ? await fetchAllPages(accessToken, json["@odata.nextLink"]) : [];
  return [...(json.value ?? []), ...rest];
}

export async function listTodoLists(accessToken: string): Promise<any[]> {
  return fetchAllPages(accessToken, `${GRAPH_BASE}/me/todo/lists`);
}

export async function createList(accessToken: string, displayName: string): Promise<any> {
  return graphJson(accessToken, `${GRAPH_BASE}/me/todo/lists`, jsonBody("POST", { displayName }));
}

export async function createTaskGroup(accessToken: string, name: string): Promise<any> {
  return graphJson(accessToken, `${GRAPH_BETA}/me/outlook/taskGroups`, jsonBody("POST", { name }));
}

export async function createTaskFolderInGroup(accessToken: string, groupId: string, name: string): Promise<any> {
  return graphJson(accessToken, `${GRAPH_BETA}/me/outlook/taskGroups/${groupId}/taskFolders`, jsonBody("POST", { name }));
}

export async function renameList(accessToken: string, listId: string, displayName: string): Promise<any> {
  return graphJson(accessToken, `${GRAPH_BASE}/me/todo/lists/${listId}`, jsonBody("PATCH", { displayName }));
}

export async function deleteList(accessToken: string, listId: string): Promise<Response> {
  return graphDelete(accessToken, `${GRAPH_BASE}/me/todo/lists/${listId}`);
}

export async function listTasks(accessToken: string, listId: string): Promise<{ value: any[] }> {
  return { value: await fetchAllPages(accessToken, `${GRAPH_BASE}/me/todo/lists/${listId}/tasks`) };
}

export async function createTask(accessToken: string, listId: string, title: string): Promise<any> {
  return graphJson(accessToken, `${GRAPH_BASE}/me/todo/lists/${listId}/tasks`, jsonBody("POST", { title }));
}

export async function updateTaskStatus(
  accessToken: string,
  listId: string,
  taskId: string,
  status: "notStarted" | "completed"
): Promise<any> {
  return updateTask(accessToken, listId, taskId, { status });
}

export async function updateTask(
  accessToken: string,
  listId: string,
  taskId: string,
  patch: { title?: string; status?: "notStarted" | "completed" }
): Promise<any> {
  return graphJson(accessToken, `${GRAPH_BASE}/me/todo/lists/${listId}/tasks/${taskId}`, jsonBody("PATCH", patch));
}

export async function deleteTask(accessToken: string, listId: string, taskId: string): Promise<Response> {
  return graphDelete(accessToken, `${GRAPH_BASE}/me/todo/lists/${listId}/tasks/${taskId}`);
}

export async function addChecklistItem(
  accessToken: string,
  listId: string,
  taskId: string,
  displayName: string
): Promise<any> {
  return graphJson(
    accessToken,
    `${GRAPH_BASE}/me/todo/lists/${listId}/tasks/${taskId}/checklistItems`,
    jsonBody("POST", { displayName })
  );
}

export async function getTasksDelta(accessToken: string, listId: string, deltaLink?: string): Promise<any> {
  return graphJson(accessToken, deltaLink ?? `${GRAPH_BASE}/me/todo/lists/${listId}/tasks/delta`);
}

function isExpiredDelta(err: unknown): boolean {
  return err instanceof GraphError && err.status === 410;
}

async function fetchDeltaPages(accessToken: string, url: string): Promise<{ items: any[]; deltaLink: string }> {
  const json = await graphJson(accessToken, url);
  const items = json.value ?? [];
  const deltaLink = json["@odata.deltaLink"];
  const nextLink = json["@odata.nextLink"];
  const rest: { items: any[]; deltaLink: string } = await (deltaLink
    ? Promise.resolve({ items: [], deltaLink })
    : nextLink
      ? fetchDeltaPages(accessToken, nextLink)
      : Promise.reject(new Error(`Delta-respons zonder deltaLink of nextLink: ${url}`)));
  return { items: [...items, ...rest.items], deltaLink: rest.deltaLink };
}

export async function fetchTasksDeltaAll(
  accessToken: string,
  listId: string,
  startLink?: string
): Promise<{ items: any[]; deltaLink: string }> {
  const freshUrl = `${GRAPH_BASE}/me/todo/lists/${listId}/tasks/delta`;
  return fetchDeltaPages(accessToken, startLink ?? freshUrl).catch((err) =>
    isExpiredDelta(err) && startLink ? fetchDeltaPages(accessToken, freshUrl) : Promise.reject(err)
  );
}
