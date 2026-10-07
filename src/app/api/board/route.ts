import { NextResponse } from "next/server";
import {
  addStory,
  addTask,
  bulkConvertToStory,
  bulkConvertToTask,
  bulkDelete,
  bulkMoveGroup,
  bulkSetStatus,
  convertStoryToTask,
  convertTaskToStory,
  deleteStory,
  deleteTask,
  moveStoryToGroup,
  moveTask,
  readBoardData,
  renameGroup,
  reorderGroups,
  reorderStories,
  reorderTasks,
  updateStory,
  updateTask,
  writeBoardData,
} from "@/lib/dataStore";
import { withEffectiveStatus } from "@/lib/derive";
import type { Action } from "@/lib/actions";
import type { BoardData } from "@/lib/types";

function applyAction(data: BoardData, action: Action): BoardData {
  switch (action.type) {
    case "add_story":
      return addStory(data, action.title, action.group, action.status);
    case "update_story":
      return updateStory(data, action.index, action.patch);
    case "delete_story":
      return deleteStory(data, action.index);
    case "add_task":
      return addTask(data, action.storyIndex, action.title, action.status);
    case "update_task":
      return updateTask(data, action.storyIndex, action.taskIndex, action.patch);
    case "delete_task":
      return deleteTask(data, action.storyIndex, action.taskIndex);
    case "move_task":
      return moveTask(data, action.fromStoryIndex, action.taskIndex, action.toStoryIndex, action.status);
    case "convert_story_to_task":
      return convertStoryToTask(data, action.storyIndex, action.toStoryIndex, action.status);
    case "convert_task_to_story":
      return convertTaskToStory(data, action.storyIndex, action.taskIndex, action.status);
    case "bulk_move_group":
      return bulkMoveGroup(data, action.storyIndexes, action.group);
    case "bulk_set_status":
      return bulkSetStatus(data, action.targets, action.status);
    case "bulk_delete":
      return bulkDelete(data, action.targets);
    case "bulk_convert_to_task":
      return bulkConvertToTask(data, action.storyIndexes, action.toStoryIndex);
    case "bulk_convert_to_story":
      return bulkConvertToStory(data, action.targets);
    case "reorder_stories":
      return reorderStories(data, action.orderedIndexes);
    case "reorder_tasks":
      return reorderTasks(data, action.storyIndex, action.orderedIndexes);
    case "reorder_groups":
      return reorderGroups(data, action.orderedGroups);
    case "rename_group":
      return renameGroup(data, action.group, action.newName);
    case "move_story_to_group":
      return moveStoryToGroup(data, action.storyIndex, action.group, action.toIndex, action.status);
  }
}

function toResponse(data: BoardData) {
  return { stories: data.stories.map(withEffectiveStatus) };
}

function requireList(req: Request): string {
  const list = new URL(req.url).searchParams.get("list");
  if (!list) throw new Error("Ontbrekende lijst");
  return list;
}

export async function GET(req: Request) {
  try {
    return NextResponse.json(toResponse(readBoardData(requireList(req))));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const list = requireList(req);
    const action: Action = await req.json();
    const next = applyAction(readBoardData(list), action);
    writeBoardData(list, next);
    return NextResponse.json(toResponse(next));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
