import { readBoardData, writeBoardData } from "../src/lib/dataStore.ts";
import type { Story } from "../src/lib/types.ts";
import type { SyncConfig } from "../src/lib/syncConfig.ts";
import { loadState, saveState } from "../src/lib/syncState.ts";
import type { SyncedItem, SyncState } from "../src/lib/syncState.ts";
import * as todo from "./msftTodoClient.mts";
import { discoverLists } from "./syncDiscover.mts";

function graphStatusToLocal(graphStatus: string, previousLocalStatus: string | undefined): Story["status"] {
  if (graphStatus === "completed") return "done";
  if (previousLocalStatus === "done") return "to_do";
  return (previousLocalStatus as Story["status"]) ?? "backlog";
}

function groupStoriesFromItems(items: SyncedItem[], group: string): Story[] {
  return items.map((item) => ({ title: item.title, group, status: item.status as Story["status"], tasks: [] }));
}

function itemsEqual(a: SyncedItem[], b: SyncedItem[]): boolean {
  return (
    a.length === b.length &&
    a.every((item, i) => item.title === b[i].title && item.status === b[i].status && item.msftId === b[i].msftId)
  );
}

function fileChangedSince(listName: string, snapshot: { stories: Story[] }): boolean {
  const changed = JSON.stringify(readBoardData(listName)) !== JSON.stringify(snapshot);
  if (changed) console.log(`[sync] ${listName} lokaal gewijzigd tijdens pull — overgeslagen, volgende cyclus pusht eerst`);
  return changed;
}

function commitPull(listName: string, snapshot: { stories: Story[] }, storiesByGroup: Map<string, Story[]>, state: SyncState, changed: boolean): boolean {
  const stale = fileChangedSince(listName, snapshot);
  if (!stale && changed) writeBoardData(listName, { stories: rebuildStories(snapshot, storiesByGroup) });
  if (!stale) saveState(listName, state);
  return !stale && changed;
}

function rebuildStories(
  data: { stories: Story[] },
  storiesByGroup: Map<string, Story[]>
): Story[] {
  const orderedGroups = [...new Set(data.stories.map((s) => s.group || "Algemeen"))];
  const remainingGroups = [...storiesByGroup.keys()].filter((g) => !orderedGroups.includes(g));
  return [...orderedGroups, ...remainingGroups].flatMap((g) => storiesByGroup.get(g) ?? []);
}

// Push moet altijd vóór pull/reconcile in dezelfde cyclus draaien: deze functies herbouwen
// een groep volledig vanuit het state-bestand, dus als push nog niet is geweest bevat state
// een oude status en zou een niet-gepushte lokale wijziging hier overschreven worden.
export async function pullList(accessToken: string, listName: string, config: SyncConfig): Promise<boolean> {
  const listConfig = config.lists[listName];
  const data = readBoardData(listName);
  const state = loadState(listName);
  let changed = false;

  const storiesByGroup = new Map<string, Story[]>();
  for (const story of data.stories) {
    const group = story.group || "Algemeen";
    storiesByGroup.set(group, [...(storiesByGroup.get(group) ?? []), story]);
  }

  for (const [group, todoListId] of Object.entries(listConfig.groups)) {
    const groupState = state[group] ?? { items: [] };
    const { items: deltaItems, deltaLink } = await todo.fetchTasksDeltaAll(accessToken, todoListId, groupState.deltaLink);

    if (deltaItems.length === 0) {
      state[group] = { ...groupState, deltaLink };
      continue;
    }

    const byMsftId = new Map(groupState.items.map((item) => [item.msftId, item]));
    for (const task of deltaItems) {
      if (task["@removed"]) {
        byMsftId.delete(task.id);
      } else {
        const newStatus = graphStatusToLocal(task.status, byMsftId.get(task.id)?.status);
        byMsftId.set(task.id, { title: task.title, status: newStatus, msftId: task.id });
      }
    }

    const items = [...byMsftId.values()];
    if (!itemsEqual(items, groupState.items)) {
      changed = true;
      storiesByGroup.set(group, groupStoriesFromItems(items, group));
    }
    state[group] = { items, deltaLink };
  }

  return commitPull(listName, data, storiesByGroup, state, changed);
}

// Vangnet naast pullList: Graph's delta-feed rapporteert verwijderingen bij personal accounts
// niet altijd (empirisch vastgesteld), waardoor lokaal stiekem verwijderde taken kunnen
// blijven staan. Deze functie haalt per groep de volledige, actuele takenlijst op (geen
// delta) en corrigeert daarmee die drift. Duurder, dus alleen af en toe draaien.
export async function fullReconcileList(accessToken: string, listName: string, config: SyncConfig): Promise<boolean> {
  const discovered = await discoverLists(accessToken, listName, config);
  const listConfig = config.lists[listName];
  const data = readBoardData(listName);
  const state = loadState(listName);
  let changed = discovered;

  const storiesByGroup = new Map<string, Story[]>();
  for (const story of data.stories) {
    const group = story.group || "Algemeen";
    storiesByGroup.set(group, [...(storiesByGroup.get(group) ?? []), story]);
  }

  for (const [group, todoListId] of Object.entries(listConfig.groups)) {
    const groupState = state[group] ?? { items: [] };
    const previousByMsftId = new Map(groupState.items.map((item) => [item.msftId, item]));
    const { value: tasks } = await todo.listTasks(accessToken, todoListId);

    const items: SyncedItem[] = tasks.map((task: any) => ({
      title: task.title,
      status: graphStatusToLocal(task.status, previousByMsftId.get(task.id)?.status),
      msftId: task.id,
    }));

    if (!itemsEqual(items, groupState.items)) {
      changed = true;
      storiesByGroup.set(group, groupStoriesFromItems(items, group));
    }
    const { deltaLink } = await todo.fetchTasksDeltaAll(accessToken, todoListId);
    state[group] = { items, deltaLink };
  }

  return commitPull(listName, data, storiesByGroup, state, changed);
}
