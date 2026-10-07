"use client";

import { useState } from "react";
import { BOARD_COLUMNS, STATUS_LABELS } from "@/lib/statuses";
import type { Status } from "@/lib/types";
import type { Row } from "./BacklogTable";

interface BulkActionBarProps {
  selectedRows: Row[];
  groupOptions: string[];
  storyOptions: { index: number; title: string }[];
  onMoveGroup: (group: string) => void;
  onSetStatus: (status: Status) => void;
  onDelete: () => void;
  onConvertToTask: (toStoryIndex: number) => void;
  onConvertToStory: () => void;
}

export function BulkActionBar({
  selectedRows,
  groupOptions,
  storyOptions,
  onMoveGroup,
  onSetStatus,
  onDelete,
  onConvertToTask,
  onConvertToStory,
}: BulkActionBarProps) {
  const [group, setGroup] = useState(groupOptions[0] ?? "Algemeen");
  const [status, setStatus] = useState<Status>("backlog");
  const [targetStoryIndex, setTargetStoryIndex] = useState<number | "">("");
  const convertibleStoryCount = selectedRows.filter((r) => r.kind === "story" && !r.hasTasks).length;
  const taskCount = selectedRows.filter((r) => r.kind === "task").length;
  const storyRowCount = selectedRows.filter((r) => r.kind === "story").length;

  return (
    <div className="bulk-bar">
      <span>{selectedRows.length} geselecteerd</span>
      <label>
        Verplaats naar groep{" "}
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          {groupOptions.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      <button type="button" disabled={storyRowCount === 0} onClick={() => onMoveGroup(group)}>
        Toepassen
      </button>
      <label>
        Status wijzigen naar{" "}
        <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          {[...BOARD_COLUMNS, "backlog" as Status].map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={() => onSetStatus(status)}>
        Toepassen
      </button>
      {convertibleStoryCount > 0 && (
        <>
          <label>
            Zet {convertibleStoryCount} story(s) als taak onder{" "}
            <select value={targetStoryIndex} onChange={(e) => setTargetStoryIndex(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">kies story...</option>
              {storyOptions.map((s) => (
                <option key={s.index} value={s.index}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={targetStoryIndex === ""}
            onClick={() => targetStoryIndex !== "" && onConvertToTask(targetStoryIndex)}
          >
            Toepassen
          </button>
        </>
      )}
      {taskCount > 0 && (
        <button type="button" onClick={onConvertToStory}>
          Zet {taskCount} taak(en) als losse story
        </button>
      )}
      <button type="button" onClick={onDelete}>
        Verwijderen
      </button>
    </div>
  );
}
