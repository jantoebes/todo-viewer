import { readBoardData } from "../src/lib/dataStore.ts";
import type { Story } from "../src/lib/types.ts";
import { saveSyncConfig } from "../src/lib/syncConfig.ts";
import type { SyncConfig, SyncListConfig } from "../src/lib/syncConfig.ts";
import { loadState, saveState } from "../src/lib/syncState.ts";
import type { SyncedItem, SyncState } from "../src/lib/syncState.ts";
import { diffGroup } from "../src/lib/syncDiff.ts";
import { localStatusToGraph } from "../src/lib/msftStatusMapping.ts";
import * as todo from "./msftTodoClient.mts";

function groupsInStories(stories: Story[]): string[] {
  return [...new Set(stories.map((s) => s.group || "Algemeen"))];
}

async function ensureFolder(accessToken: string, listConfig: SyncListConfig, listName: string): Promise<string | undefined> {
  if (!listConfig.folderDisplayName) return listConfig.folder;
  if (listConfig.folder) return listConfig.folder;
  const created = await todo.createTaskGroup(accessToken, listConfig.folderDisplayName);
  listConfig.folder = created.id;
  console.log(`nieuwe Microsoft Todo-folder aangemaakt: ${listConfig.folderDisplayName} -> ${created.id}`);
  return created.id;
}

async function ensureListForGroup(
  accessToken: string,
  listConfig: SyncListConfig,
  folderId: string | undefined,
  group: string
): Promise<string> {
  const existing = listConfig.groups[group];
  if (existing) return existing;
  const displayName = listConfig.displayName ? `${listConfig.displayName} · ${group}` : group;
  const created = folderId
    ? await todo.createTaskFolderInGroup(accessToken, folderId, displayName)
    : await todo.createList(accessToken, displayName);
  listConfig.groups[group] = created.id;
  console.log(`nieuwe Microsoft Todo-lijst aangemaakt voor groep "${group}": ${created.id}`);
  return created.id;
}

async function applyDiffForGroup(
  accessToken: string,
  todoListId: string,
  prevItems: SyncedItem[],
  currStories: Story[]
): Promise<SyncedItem[]> {
  const currItems = currStories.map((s) => ({ title: s.title, status: s.status }));
  const { resolved, deletes } = diffGroup(prevItems, currItems);

  for (const del of deletes) {
    await todo.deleteTask(accessToken, todoListId, del.msftId);
    console.log(`verwijderd in Microsoft Todo: ${del.title}`);
  }

  const finalItems: SyncedItem[] = [];
  for (const item of resolved) {
    if (!item.msftId) {
      const created = await todo.createTask(accessToken, todoListId, item.title);
      if (item.status === "done") await todo.updateTask(accessToken, todoListId, created.id, { status: "completed" });
      finalItems.push({ title: item.title, status: item.status, msftId: created.id });
      console.log(`aangemaakt in Microsoft Todo: ${item.title}`);
    } else if (item.changed) {
      await todo.updateTask(accessToken, todoListId, item.msftId, {
        title: item.title,
        status: localStatusToGraph(item.status as Story["status"]),
      });
      finalItems.push({ title: item.title, status: item.status, msftId: item.msftId });
      console.log(`bijgewerkt in Microsoft Todo: ${item.title}`);
    } else {
      finalItems.push({ title: item.title, status: item.status, msftId: item.msftId });
    }
  }

  return finalItems;
}

async function deleteEmptiedGroup(accessToken: string, listConfig: SyncListConfig, group: string): Promise<void> {
  const todoListId = listConfig.groups[group];
  if (!todoListId) return;
  await todo.deleteList(accessToken, todoListId);
  delete listConfig.groups[group];
  console.log(`Microsoft Todo-lijst verwijderd (groep leeg): ${group}`);
}

function isDeletable(group: string, state: SyncState, listConfig: SyncListConfig): boolean {
  const hadItems = (state[group]?.items.length ?? 0) > 0;
  const isProtected = (listConfig.protectedListIds ?? []).includes(listConfig.groups[group] ?? "");
  return hadItems && !isProtected;
}

function partitionEmptiedGroups(groups: string[], state: SyncState, listConfig: SyncListConfig): [string[], string[]] {
  return [
    groups.filter((g) => isDeletable(g, state, listConfig)),
    groups.filter((g) => !isDeletable(g, state, listConfig)),
  ];
}

export async function pushList(accessToken: string, listName: string, config: SyncConfig): Promise<void> {
  const listConfig = config.lists[listName];
  const data = readBoardData(listName);
  const state = loadState(listName);

  const groups = groupsInStories(data.stories);
  const groupsBefore = new Set(Object.keys(listConfig.groups));
  const folderBefore = listConfig.folder;
  const newState: SyncState = {};

  const folderId = await ensureFolder(accessToken, listConfig, listName);

  for (const group of groups) {
    const todoListId = await ensureListForGroup(accessToken, listConfig, folderId, group);
    const storiesInGroup = data.stories.filter((s) => (s.group || "Algemeen") === group);
    const prevItems = state[group]?.items ?? [];
    const items = await applyDiffForGroup(accessToken, todoListId, prevItems, storiesInGroup);
    newState[group] = { items, deltaLink: state[group]?.deltaLink };
  }

  const emptiedGroups = Object.keys(state).filter((group) => !groups.includes(group));
  const [deletable, kept] = partitionEmptiedGroups(emptiedGroups, state, listConfig);
  for (const group of deletable) await deleteEmptiedGroup(accessToken, listConfig, group);
  kept.forEach((group) => {
    newState[group] = { items: [], deltaLink: state[group]?.deltaLink };
  });

  saveState(listName, newState);
  const groupsAfter = new Set(Object.keys(listConfig.groups));
  const configChanged =
    folderBefore !== listConfig.folder ||
    groupsAfter.size !== groupsBefore.size ||
    [...groupsAfter].some((g) => !groupsBefore.has(g));
  if (configChanged) saveSyncConfig(config);
}
