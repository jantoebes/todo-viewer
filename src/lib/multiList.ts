import type { Action, BulkTarget } from "./actions";
import type { BoardData, Story } from "./types";

const GROUP_SEPARATOR = ": ";

export interface Origin {
  list: string;
  realIndex: number;
}

export interface MergedBoard {
  stories: Story[];
  origins: Origin[];
}

export interface TranslatedAction {
  list: string;
  action: Action;
}

export function prefixGroup(list: string, group: string): string {
  return `${list}${GROUP_SEPARATOR}${group}`;
}

function splitGroup(prefixed: string): { list: string; group: string } | undefined {
  const at = prefixed.indexOf(GROUP_SEPARATOR);
  return at === -1 ? undefined : { list: prefixed.slice(0, at), group: prefixed.slice(at + GROUP_SEPARATOR.length) };
}

function stripPrefix(list: string, name: string): string {
  const split = splitGroup(name);
  return split && split.list === list ? split.group : name;
}

export function mergeBoards(
  boardsByList: Record<string, BoardData>,
  listOrder: string[],
  groupOf: (list: string, story: Story) => string
): MergedBoard {
  const entries = listOrder.flatMap((list) =>
    (boardsByList[list]?.stories ?? []).map((story, realIndex) => ({
      story: { ...story, group: groupOf(list, story) },
      origin: { list, realIndex },
    }))
  );
  return { stories: entries.map((e) => e.story), origins: entries.map((e) => e.origin) };
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  items.forEach((item) => map.set(keyOf(item), [...(map.get(keyOf(item)) ?? []), item]));
  return [...map.entries()];
}

export function translateActions(action: Action, origins: Origin[]): TranslatedAction[] {
  const listOf = (i: number) => origins[i]?.list;
  const remap = (i: number) => origins[i].realIndex;
  const sameList = (a: number, b: number) => listOf(a) === listOf(b);
  const allSameList = (indexes: number[]) => indexes.length > 0 && indexes.every((i) => sameList(i, indexes[0]));
  const remapTarget = (t: BulkTarget): BulkTarget => ({ ...t, storyIndex: remap(t.storyIndex) });
  const single = (list: string | undefined, translated: Action): TranslatedAction[] => (list ? [{ list, action: translated }] : []);
  const perListTargets = (targets: BulkTarget[], build: (targets: BulkTarget[]) => Action): TranslatedAction[] =>
    groupBy(targets, (t) => listOf(t.storyIndex)).map(([list, ts]) => ({ list, action: build(ts.map(remapTarget)) }));

  switch (action.type) {
    case "update_story":
    case "delete_story":
      return single(listOf(action.index), { ...action, index: remap(action.index) });
    case "add_task":
    case "update_task":
    case "delete_task":
    case "convert_task_to_story":
    case "reorder_tasks":
      return single(listOf(action.storyIndex), { ...action, storyIndex: remap(action.storyIndex) });
    case "move_task":
      return sameList(action.fromStoryIndex, action.toStoryIndex)
        ? single(listOf(action.fromStoryIndex), { ...action, fromStoryIndex: remap(action.fromStoryIndex), toStoryIndex: remap(action.toStoryIndex) })
        : [];
    case "convert_story_to_task":
      return sameList(action.storyIndex, action.toStoryIndex)
        ? single(listOf(action.storyIndex), { ...action, storyIndex: remap(action.storyIndex), toStoryIndex: remap(action.toStoryIndex) })
        : [];
    case "reorder_stories":
      return allSameList(action.orderedIndexes)
        ? single(listOf(action.orderedIndexes[0]), { ...action, orderedIndexes: action.orderedIndexes.map(remap) })
        : [];
    case "add_story": {
      const split = splitGroup(action.group);
      return split ? single(split.list, { ...action, group: split.group }) : [];
    }
    case "rename_group": {
      const split = splitGroup(action.group);
      return split ? single(split.list, { ...action, group: split.group, newName: stripPrefix(split.list, action.newName) }) : [];
    }
    case "move_story_to_group": {
      const split = splitGroup(action.group);
      return split && split.list === listOf(action.storyIndex)
        ? single(split.list, { ...action, storyIndex: remap(action.storyIndex), group: split.group })
        : [];
    }
    case "bulk_move_group": {
      const split = splitGroup(action.group);
      return split && allSameList(action.storyIndexes) && split.list === listOf(action.storyIndexes[0])
        ? single(split.list, { ...action, storyIndexes: action.storyIndexes.map(remap), group: split.group })
        : [];
    }
    case "bulk_convert_to_task":
      return allSameList([...action.storyIndexes, action.toStoryIndex])
        ? single(listOf(action.toStoryIndex), { ...action, storyIndexes: action.storyIndexes.map(remap), toStoryIndex: remap(action.toStoryIndex) })
        : [];
    case "bulk_set_status":
      return perListTargets(action.targets, (targets) => ({ ...action, targets }));
    case "bulk_delete":
      return perListTargets(action.targets, (targets) => ({ ...action, targets }));
    case "bulk_convert_to_story":
      return perListTargets(action.targets, (targets) => ({ ...action, targets }));
    case "reorder_groups": {
      const parsed = action.orderedGroups.map(splitGroup).filter((s): s is { list: string; group: string } => s !== undefined);
      return groupBy(parsed, (s) => s.list).map(([list, groups]) => ({ list, action: { type: "reorder_groups", orderedGroups: groups.map((g) => g.group) } }));
    }
  }
}
