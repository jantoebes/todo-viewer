"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { BOARD_COLUMNS, STATUS_LABELS } from "@/lib/statuses";
import type { Status } from "@/lib/types";
import { EditableText } from "./EditableText";

interface BoardCardProps {
  id: string;
  title: string;
  status: Status;
  locked?: boolean;
  isDesktop: boolean;
  onStatusChange: (cardId: string, status: Status) => void;
  onRename: (cardId: string, title: string) => void;
  onDelete: (cardId: string) => void;
  onMove: (cardId: string, direction: -1 | 1) => void;
}

export function BoardCard({ id, title, status, locked, isDesktop, onStatusChange, onRename, onDelete, onMove }: BoardCardProps) {
  const { attributes, listeners, setNodeRef: setDragRef, transform } = useDraggable({ id, disabled: !isDesktop || locked });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id, disabled: !isDesktop || locked });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, position: "relative" as const, zIndex: 5 }
    : undefined;

  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      style={style}
      className={`board-card${isOver ? " drop-target" : ""}${locked ? " board-card-locked" : ""}`}
      title={locked ? "Status wordt bepaald door de taken van deze story" : undefined}
      {...(isDesktop && !locked ? attributes : {})}
      {...(isDesktop && !locked ? listeners : {})}
    >
      <div className="board-card-row">
        <EditableText value={title} onCommit={(v) => onRename(id, v)} />
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => onDelete(id)}>
          ×
        </button>
      </div>
      {!isDesktop && !locked && (
        <>
          <select value={status} onChange={(e) => onStatusChange(id, e.target.value as Status)}>
            {BOARD_COLUMNS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <div className="board-card-reorder">
            <button type="button" onClick={() => onMove(id, -1)}>
              ▲
            </button>
            <button type="button" onClick={() => onMove(id, 1)}>
              ▼
            </button>
          </div>
        </>
      )}
    </div>
  );
}
