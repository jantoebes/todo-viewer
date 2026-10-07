import fs from "fs";
import path from "path";
import type { BulkTarget } from "./actions";
import type { BoardData, Status, Story, Task } from "./types";

import { DATA_DIR } from "./paths.ts";
const LIST_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const LIST_EXTENSION = ".todo";

export class InvalidListNameError extends Error {}

export function isValidListName(name: string): boolean {
  return LIST_NAME_PATTERN.test(name);
}

function listPath(list: string): string {
  if (!isValidListName(list)) throw new InvalidListNameError(`Ongeldige lijstnaam: ${list}`);
  return path.join(DATA_DIR, `${list}${LIST_EXTENSION}`);
}

export function listAvailableLists(): string[] {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(LIST_EXTENSION))
    .map((f) => f.slice(0, -LIST_EXTENSION.length))
    .filter(isValidListName)
    .sort((a, b) => a.localeCompare(b));
}

export function createList(list: string): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const target = listPath(list);
  if (!fs.existsSync(target)) fs.writeFileSync(target, "", "utf8");
}

const lastWrittenContentByList = new Map<string, string>();

export function wasLastWrittenByUs(list: string, content: string): boolean {
  return content === lastWrittenContentByList.get(list);
}

// Custom compact line format (not YAML): a `# group` header line, followed by
// one story per line for that group, comma-separated `title, status` (status
// optional, defaults to "backlog") and optional `[title, status]` task groups.
// Bare commas outside `[...]`/`"..."`
// only work as separators here because we hand-roll the split below; a real
// YAML parser would treat the whole line as a single plain scalar.
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inQuotes = false;
  let current = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      current += ch;
      if (ch === "\\") {
        current += input[++i] ?? "";
      } else if (ch === '"') {
        inQuotes = false;
      }
    } else if (ch === '"') {
      inQuotes = true;
      current += ch;
    } else if (ch === "[") {
      depth++;
      current += ch;
    } else if (ch === "]") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function parseScalar(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith('"') ? JSON.parse(trimmed) : trimmed;
}

const DEFAULT_STATUS: Status = "backlog";

function parseTaskGroup(raw: string): Task {
  const inner = raw.trim().replace(/^\[/, "").replace(/\]$/, "");
  const fields = splitTopLevel(inner);
  const title = parseScalar(fields[0]);
  const hasStatus = fields.length > 1 && fields[1].trim() !== "";
  const status = hasStatus ? (parseScalar(fields[1]) as Status) : DEFAULT_STATUS;
  return { title, status };
}

function parseStoryLine(line: string, group: string): Story {
  const [title, ...rest] = splitTopLevel(line);
  const hasStatus = rest.length > 0 && rest[0].trim() !== "" && !rest[0].trim().startsWith("[");
  const status = hasStatus ? (parseScalar(rest[0]) as Status) : DEFAULT_STATUS;
  const taskFields = hasStatus ? rest.slice(1) : rest;
  return {
    group,
    title: parseScalar(title),
    status,
    tasks: taskFields.filter((f) => f.trim() !== "").map(parseTaskGroup),
  };
}

function stripNewlines(value: string): string {
  return value.replace(/\n/g, " ");
}

function isSafePlainScalar(value: string): boolean {
  return value !== "" && value.trim() === value && !/[,[\]"]/.test(value);
}

function formatScalar(value: string): string {
  const clean = stripNewlines(value);
  return isSafePlainScalar(clean) ? clean : JSON.stringify(clean);
}

function formatTaskGroup(task: Task): string {
  const title = formatScalar(task.title.toLowerCase());
  return task.status === DEFAULT_STATUS ? `[${title}]` : `[${title}, ${formatScalar(task.status)}]`;
}

function formatStoryLine(story: Story, titleWidth: number, statusWidth: number): string {
  const title = `${formatScalar(story.title.toLowerCase())},`.padEnd(titleWidth + 2);
  const hasTasks = story.tasks.length > 0;

  // Een story met taken heeft geen eigen, onafhankelijk instelbare status — die volgt
  // altijd uit de taken (zie effectiveStatus) — dus die laten we hier leeg. Wel houden
  // we de (lege) status-kolom aan als plaatshouder, zodat taken overal in dezelfde
  // kolom beginnen, ook op regels zonder taken die wel een status laten zien.
  if (hasTasks) {
    const statusSlot = ",".padEnd(statusWidth + 2);
    return `${title}${statusSlot}${story.tasks.map(formatTaskGroup).join(", ")}`;
  }

  const statusText = story.status === DEFAULT_STATUS ? "" : formatScalar(story.status);
  return `${title}${statusText}`;
}

const MAX_TITLE_ALIGN_WIDTH = 90;

function groupsInFileOrder(stories: Story[]): string[] {
  return [...new Set(stories.map((s) => s.group || "Algemeen"))];
}

function serializeBoardYaml(data: BoardData): string {
  const titleWidth = Math.min(
    MAX_TITLE_ALIGN_WIDTH,
    Math.max(0, ...data.stories.map((s) => formatScalar(s.title).length))
  );
  const statusWidth = Math.max(0, ...data.stories.map((s) => formatScalar(s.status).length));

  const sections = groupsInFileOrder(data.stories).map((group) => {
    const lines = data.stories
      .filter((s) => (s.group || "Algemeen") === group)
      .map((s) => formatStoryLine(s, titleWidth, statusWidth));
    return `# ${group}\n${lines.join("\n")}`;
  });
  return sections.length > 0 ? `${sections.join("\n\n")}\n` : "";
}

export function readBoardData(list: string): BoardData {
  const target = listPath(list);
  const raw = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");

  let currentGroup = "Algemeen";
  const stories: Story[] = [];
  lines.forEach((line) => {
    if (line.startsWith("#")) {
      currentGroup = line.slice(1).trim();
    } else {
      stories.push(parseStoryLine(line, currentGroup));
    }
  });
  return { stories };
}

export function writeBoardData(list: string, data: BoardData): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const content = serializeBoardYaml(data);
  lastWrittenContentByList.set(list, content);
  if (!isOnDisk(list, content)) fs.writeFileSync(listPath(list), content, "utf8");
}

function isOnDisk(list: string, content: string): boolean {
  const target = listPath(list);
  return fs.existsSync(target) && fs.readFileSync(target, "utf8") === content;
}

export function addStory(data: BoardData, title: string, group: string, status: Status = "backlog"): BoardData {
  const story: Story = { title, group: group || "Algemeen", status, tasks: [] };
  return { stories: [...data.stories, story] };
}

export function updateStory(
  data: BoardData,
  index: number,
  patch: Partial<Pick<Story, "title" | "group" | "status">>
): BoardData {
  return { stories: data.stories.map((s, i) => (i === index ? { ...s, ...patch } : s)) };
}

export function deleteStory(data: BoardData, index: number): BoardData {
  return { stories: data.stories.filter((_, i) => i !== index) };
}

export function addTask(data: BoardData, storyIndex: number, title: string, status: Status = "backlog"): BoardData {
  const task: Task = { title, status };
  return {
    stories: data.stories.map((s, i) => (i === storyIndex ? { ...s, tasks: [...s.tasks, task] } : s)),
  };
}

export function updateTask(
  data: BoardData,
  storyIndex: number,
  taskIndex: number,
  patch: Partial<Pick<Task, "title" | "status">>
): BoardData {
  return {
    stories: data.stories.map((s, i) =>
      i === storyIndex ? { ...s, tasks: s.tasks.map((t, j) => (j === taskIndex ? { ...t, ...patch } : t)) } : s
    ),
  };
}

export function deleteTask(data: BoardData, storyIndex: number, taskIndex: number): BoardData {
  return {
    stories: data.stories.map((s, i) =>
      i === storyIndex ? { ...s, tasks: s.tasks.filter((_, j) => j !== taskIndex) } : s
    ),
  };
}

export function moveTask(
  data: BoardData,
  fromStoryIndex: number,
  taskIndex: number,
  toStoryIndex: number,
  status: Status
): BoardData {
  const moved: Task = { ...data.stories[fromStoryIndex].tasks[taskIndex], status };
  return {
    stories: data.stories.map((s, i) =>
      i === fromStoryIndex && i === toStoryIndex
        ? { ...s, tasks: s.tasks.map((t, j) => (j === taskIndex ? moved : t)) }
        : i === fromStoryIndex
          ? { ...s, tasks: s.tasks.filter((_, j) => j !== taskIndex) }
          : i === toStoryIndex
            ? { ...s, tasks: [...s.tasks, moved] }
            : s
    ),
  };
}

export function convertTaskToStory(data: BoardData, storyIndex: number, taskIndex: number, status: Status): BoardData {
  const source = data.stories[storyIndex];
  const newStory: Story = { title: source.tasks[taskIndex].title, group: source.group, status, tasks: [] };
  return {
    stories: [
      ...data.stories.map((s, i) => (i === storyIndex ? { ...s, tasks: s.tasks.filter((_, j) => j !== taskIndex) } : s)),
      newStory,
    ],
  };
}

export function convertStoryToTask(data: BoardData, storyIndex: number, toStoryIndex: number, status: Status): BoardData {
  const task: Task = { title: data.stories[storyIndex].title, status };
  return {
    stories: data.stories
      .map((s, i) => (i === toStoryIndex ? { ...s, tasks: [...s.tasks, task] } : s))
      .filter((_, i) => i !== storyIndex),
  };
}

export function bulkMoveGroup(data: BoardData, storyIndexes: number[], group: string): BoardData {
  const indexes = new Set(storyIndexes);
  return { stories: data.stories.map((s, i) => (indexes.has(i) ? { ...s, group } : s)) };
}

function taskIndexesByStory(targets: BulkTarget[]): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>();
  targets
    .filter((t): t is Required<BulkTarget> => t.taskIndex !== undefined)
    .forEach((t) => {
      const indexes = map.get(t.storyIndex) ?? new Set<number>();
      indexes.add(t.taskIndex);
      map.set(t.storyIndex, indexes);
    });
  return map;
}

export function bulkSetStatus(data: BoardData, targets: BulkTarget[], status: Status): BoardData {
  const storyOnlyIndexes = new Set(targets.filter((t) => t.taskIndex === undefined).map((t) => t.storyIndex));
  const byStory = taskIndexesByStory(targets);

  return {
    stories: data.stories.map((s, i) => {
      const taskIndexes = byStory.get(i);
      const tasks = taskIndexes ? s.tasks.map((t, j) => (taskIndexes.has(j) ? { ...t, status } : t)) : s.tasks;
      return storyOnlyIndexes.has(i) && s.tasks.length === 0 ? { ...s, status, tasks } : { ...s, tasks };
    }),
  };
}

export function bulkDelete(data: BoardData, targets: BulkTarget[]): BoardData {
  const storyIndexesToDelete = new Set(targets.filter((t) => t.taskIndex === undefined).map((t) => t.storyIndex));
  const byStory = taskIndexesByStory(targets);

  return {
    stories: data.stories
      .map((s, i) => {
        const taskIndexes = byStory.get(i);
        return taskIndexes ? { ...s, tasks: s.tasks.filter((_, j) => !taskIndexes.has(j)) } : s;
      })
      .filter((_, i) => !storyIndexesToDelete.has(i)),
  };
}

export function bulkConvertToTask(data: BoardData, storyIndexes: number[], toStoryIndex: number): BoardData {
  const convertibleIndexes = new Set(
    storyIndexes.filter((i) => i !== toStoryIndex && data.stories[i].tasks.length === 0)
  );
  const newTasks: Task[] = [...convertibleIndexes].map((i) => ({
    title: data.stories[i].title,
    status: data.stories[i].status,
  }));

  return {
    stories: data.stories
      .map((s, i) => (i === toStoryIndex ? { ...s, tasks: [...s.tasks, ...newTasks] } : s))
      .filter((_, i) => !convertibleIndexes.has(i)),
  };
}

export function bulkConvertToStory(data: BoardData, targets: BulkTarget[]): BoardData {
  const byStory = taskIndexesByStory(targets);
  const newStories: Story[] = [];
  data.stories.forEach((s, i) =>
    byStory.get(i)?.forEach((j) => newStories.push({ title: s.tasks[j].title, group: s.group, status: s.tasks[j].status, tasks: [] }))
  );

  return {
    stories: [
      ...data.stories.map((s, i) => {
        const taskIndexes = byStory.get(i);
        return taskIndexes ? { ...s, tasks: s.tasks.filter((_, j) => !taskIndexes.has(j)) } : s;
      }),
      ...newStories,
    ],
  };
}

function reorderSubsequence<T>(items: T[], orderedIndexes: number[]): T[] {
  const positions = new Set(orderedIndexes);
  const replacements = orderedIndexes.map((i) => items[i]);
  let cursor = 0;
  return items.map((item, i) => (positions.has(i) ? replacements[cursor++] : item));
}

export function reorderStories(data: BoardData, orderedIndexes: number[]): BoardData {
  return { stories: reorderSubsequence(data.stories, orderedIndexes) };
}

export function reorderTasks(data: BoardData, storyIndex: number, orderedTaskIndexes: number[]): BoardData {
  return {
    stories: data.stories.map((s, i) =>
      i === storyIndex ? { ...s, tasks: reorderSubsequence(s.tasks, orderedTaskIndexes) } : s
    ),
  };
}

export function reorderGroups(data: BoardData, orderedGroups: string[]): BoardData {
  const byGroup = new Map<string, Story[]>();
  data.stories.forEach((s) => {
    const key = s.group || "Algemeen";
    byGroup.set(key, [...(byGroup.get(key) ?? []), s]);
  });
  const missing = [...byGroup.keys()].filter((g) => !orderedGroups.includes(g));
  return { stories: [...orderedGroups, ...missing].flatMap((g) => byGroup.get(g) ?? []) };
}

export function renameGroup(data: BoardData, group: string, newName: string): BoardData {
  return {
    stories: data.stories.map((s) => ((s.group || "Algemeen") === group ? { ...s, group: newName } : s)),
  };
}

export function moveStoryToGroup(
  data: BoardData,
  storyIndex: number,
  group: string,
  toIndexInGroup: number,
  status?: Status
): BoardData {
  const moved: Story = { ...data.stories[storyIndex], group, ...(status ? { status } : {}) };
  const without = data.stories.filter((_, i) => i !== storyIndex);
  const groupPositions = without
    .map((s, i) => ((s.group || "Algemeen") === group ? i : -1))
    .filter((i) => i !== -1);
  const insertAt = toIndexInGroup < groupPositions.length ? groupPositions[toIndexInGroup] : (groupPositions.at(-1) ?? -1) + 1;
  return { stories: [...without.slice(0, insertAt), moved, ...without.slice(insertAt)] };
}
