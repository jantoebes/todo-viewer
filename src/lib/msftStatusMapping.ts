import type { Status } from "./types";

export function localStatusToGraph(status: Status): "notStarted" | "completed" {
  return status === "done" ? "completed" : "notStarted";
}
