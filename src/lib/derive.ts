import type { Status, Story, Task } from "./types";

export function deriveStoryStatus(tasks: Task[]): Status {
  return tasks.every((t) => t.status === "done")
    ? "done"
    : tasks.every((t) => t.status === "backlog")
      ? "backlog"
      : tasks.some((t) => t.status === "in_progress") ||
          (tasks.some((t) => t.status === "done") && tasks.some((t) => t.status === "to_do"))
        ? "in_progress"
        : tasks.some((t) => t.status === "on_hold") && !tasks.some((t) => t.status === "to_do")
          ? "on_hold"
          : "to_do";
}

export function effectiveStatus(story: Story): Status {
  return story.tasks.length > 0 ? deriveStoryStatus(story.tasks) : story.status;
}

export function groupsInUse(stories: Story[]): string[] {
  return [...new Set(stories.map((s) => s.group || "Algemeen"))];
}

export function isLaneVisible(story: Story, includeBacklog: boolean): boolean {
  return story.tasks.some((t) => includeBacklog || t.status !== "backlog");
}

export function visibleLaneTasks(story: Story, includeBacklog: boolean): Task[] {
  return includeBacklog ? story.tasks : story.tasks.filter((t) => t.status !== "backlog");
}

export function isStandaloneCardVisible(story: Story, includeBacklog: boolean): boolean {
  return story.tasks.length === 0 && (includeBacklog || effectiveStatus(story) !== "backlog");
}

export function withEffectiveStatus(story: Story): Story {
  return { ...story, status: effectiveStatus(story) };
}
