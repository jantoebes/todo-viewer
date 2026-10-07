import type { Status, Story, Task } from "./types";

export type BulkTarget = { storyIndex: number; taskIndex?: number };

export type Action =
  | { type: "add_story"; title: string; group: string; status?: Status }
  | { type: "update_story"; index: number; patch: Partial<Pick<Story, "title" | "group" | "status">> }
  | { type: "delete_story"; index: number }
  | { type: "add_task"; storyIndex: number; title: string; status?: Status }
  | { type: "update_task"; storyIndex: number; taskIndex: number; patch: Partial<Pick<Task, "title" | "status">> }
  | { type: "delete_task"; storyIndex: number; taskIndex: number }
  | { type: "move_task"; fromStoryIndex: number; taskIndex: number; toStoryIndex: number; status: Status }
  | { type: "convert_story_to_task"; storyIndex: number; toStoryIndex: number; status: Status }
  | { type: "convert_task_to_story"; storyIndex: number; taskIndex: number; status: Status }
  | { type: "bulk_move_group"; storyIndexes: number[]; group: string }
  | { type: "bulk_set_status"; targets: BulkTarget[]; status: Status }
  | { type: "bulk_delete"; targets: BulkTarget[] }
  | { type: "bulk_convert_to_task"; storyIndexes: number[]; toStoryIndex: number }
  | { type: "bulk_convert_to_story"; targets: BulkTarget[] }
  | { type: "reorder_stories"; orderedIndexes: number[] }
  | { type: "reorder_tasks"; storyIndex: number; orderedIndexes: number[] }
  | { type: "reorder_groups"; orderedGroups: string[] }
  | { type: "rename_group"; group: string; newName: string }
  | { type: "move_story_to_group"; storyIndex: number; group: string; toIndex: number; status?: Status };
