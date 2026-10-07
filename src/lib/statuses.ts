import type { Status } from "./types";

export const STATUS_ORDER: Status[] = ["backlog", "to_do", "in_progress", "on_hold", "done"];

export const STATUS_LABELS: Record<Status, string> = {
  backlog: "Backlog",
  to_do: "To Do",
  in_progress: "In Progress",
  on_hold: "On Hold",
  done: "Done",
};

export const BOARD_COLUMNS: Status[] = ["to_do", "in_progress", "on_hold", "done"];
