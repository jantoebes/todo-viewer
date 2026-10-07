"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { Status } from "@/lib/types";
import { BoardColumn } from "./BoardColumn";

export interface CardData {
  id: string;
  title: string;
  status: Status;
  locked?: boolean;
}

export interface LaneColumn {
  status: Status;
  dropId: string;
  cards: CardData[];
}

interface BoardLaneProps {
  label: string | null;
  storyIndex?: number;
  columns: LaneColumn[];
  isDesktop: boolean;
  onStatusChange: (cardId: string, status: Status) => void;
  onRenameCard: (cardId: string, title: string) => void;
  onDeleteCard: (cardId: string) => void;
  onMoveCard: (cardId: string, direction: -1 | 1) => void;
  onAddTask?: (storyIndex: number) => void;
  onMoveLane?: (storyIndex: number, direction: -1 | 1) => void;
}

export function BoardLane({
  label,
  storyIndex,
  columns,
  isDesktop,
  onStatusChange,
  onRenameCard,
  onDeleteCard,
  onMoveCard,
  onAddTask,
  onMoveLane,
}: BoardLaneProps) {
  const handleId = storyIndex !== undefined ? `lanehandle:${storyIndex}` : "lanehandle:unused";
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({ id: handleId, disabled: !isDesktop || storyIndex === undefined });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: handleId, disabled: !isDesktop || storyIndex === undefined });

  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      className={`board-lane${isOver ? " drop-target" : ""}`}
    >
      <div className="board-lane-label">
        {storyIndex !== undefined && (
          <span className="board-lane-grip" {...(isDesktop ? attributes : {})} {...(isDesktop ? listeners : {})}>
            ⠿
          </span>
        )}
        <span className="board-lane-title">{label ?? ""}</span>
        {storyIndex !== undefined && !isDesktop && onMoveLane && (
          <span className="board-lane-reorder">
            <button type="button" onClick={() => onMoveLane(storyIndex, -1)}>
              ▲
            </button>
            <button type="button" onClick={() => onMoveLane(storyIndex, 1)}>
              ▼
            </button>
          </span>
        )}
        {storyIndex !== undefined && onAddTask && (
          <button type="button" onClick={() => onAddTask(storyIndex)}>
            + taak
          </button>
        )}
      </div>
      <div className="board-lane-columns">
        {columns.map((col) => (
          <BoardColumn
            key={col.dropId}
            {...col}
            isDesktop={isDesktop}
            onStatusChange={onStatusChange}
            onRenameCard={onRenameCard}
            onDeleteCard={onDeleteCard}
            onMoveCard={onMoveCard}
          />
        ))}
      </div>
    </div>
  );
}
