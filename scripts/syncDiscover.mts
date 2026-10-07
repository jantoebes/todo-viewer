import { readBoardData, writeBoardData } from "../src/lib/dataStore.ts";
import type { Story } from "../src/lib/types.ts";
import { saveSyncConfig, DEFAULT_EXCLUDE_WELLKNOWN } from "../src/lib/syncConfig.ts";
import type { SyncConfig } from "../src/lib/syncConfig.ts";
import { loadState, saveState } from "../src/lib/syncState.ts";
import type { SyncState } from "../src/lib/syncState.ts";
import { discoverGroups } from "../src/lib/listDiscovery.ts";
import type { DiscoveryResult } from "../src/lib/listDiscovery.ts";
import * as todo from "./msftTodoClient.mts";

function idsClaimedByOtherLists(config: SyncConfig, listName: string): Set<string> {
  return new Set(
    Object.entries(config.lists)
      .filter(([name]) => name !== listName)
      .flatMap(([, list]) => Object.values(list.groups))
  );
}

function renameGroup(renamed: [string, string][], group: string): string {
  return renamed.find(([from]) => from === group)?.[1] ?? group;
}

function applyToStories(stories: Story[], result: DiscoveryResult): Story[] {
  return stories
    .filter((s) => !result.removed.includes(s.group || "Algemeen"))
    .map((s) => ({ ...s, group: renameGroup(result.renamed, s.group || "Algemeen") }));
}

function applyToState(state: SyncState, result: DiscoveryResult): SyncState {
  return Object.fromEntries(
    Object.entries(state)
      .filter(([group]) => !result.removed.includes(group))
      .map(([group, groupState]) => [renameGroup(result.renamed, group), groupState])
  );
}

function hasChanges(result: DiscoveryResult): boolean {
  return result.added.length + result.renamed.length + result.removed.length > 0;
}

function logResult(listName: string, result: DiscoveryResult): void {
  result.added.forEach((g) => console.log(`[discover] nieuwe Microsoft Todo-lijst gevonden voor ${listName}: ${g}`));
  result.renamed.forEach(([from, to]) => console.log(`[discover] lijst hernoemd in ${listName}: ${from} -> ${to}`));
  result.removed.forEach((g) => console.log(`[discover] lijst verwijderd uit ${listName}: ${g}`));
}

function applyDiscovery(listName: string, config: SyncConfig, result: DiscoveryResult): void {
  const data = readBoardData(listName);
  const stories = applyToStories(data.stories, result);
  const storiesChanged = JSON.stringify(stories) !== JSON.stringify(data.stories);
  if (storiesChanged) writeBoardData(listName, { stories });
  saveState(listName, applyToState(loadState(listName), result));
  config.lists[listName].groups = result.groups;
  config.lists[listName].protectedListIds = result.protectedListIds;
  saveSyncConfig(config);
  logResult(listName, result);
}

function protectedIdsChanged(config: SyncConfig, listName: string, result: DiscoveryResult): boolean {
  const current = config.lists[listName].protectedListIds ?? [];
  return JSON.stringify([...current].sort()) !== JSON.stringify([...result.protectedListIds].sort());
}

export async function discoverLists(accessToken: string, listName: string, config: SyncConfig): Promise<boolean> {
  const listConfig = config.lists[listName];
  const shouldDiscover = listConfig?.discover === true;
  const result = shouldDiscover
    ? discoverGroups(await todo.listTodoLists(accessToken), listConfig.groups, {
        excludeWellknown: listConfig.excludeWellknown ?? DEFAULT_EXCLUDE_WELLKNOWN,
        claimedElsewhere: idsClaimedByOtherLists(config, listName),
        prefix: listConfig.displayName,
      })
    : undefined;
  const changed = result !== undefined && (hasChanges(result) || protectedIdsChanged(config, listName, result));
  if (result && changed) applyDiscovery(listName, config, result);
  return result !== undefined && hasChanges(result);
}
