"use client";

import { useDroppable } from "@dnd-kit/core";
import { STATUS_LABELS } from "@/lib/statuses";
import type { Status } from "@/lib/types";
import { BoardCard } from "./BoardCard";
import type { CardData } from "./BoardLane";

interface BoardColumnProps {
  status: Status;
  dropId: string;
  cards: CardData[];
  isDesktop: boolean;
  onStatusChange: (cardId: string, status: Status) => void;
  onRenameCard: (cardId: string, title: string) => void;
  onDeleteCard: (cardId: string) => void;
  onMoveCard: (cardId: string, direction: -1 | 1) => void;
}

export function BoardColumn({
  status,
  dropId,
  cards,
  isDesktop,
  onStatusChange,
  onRenameCard,
  onDeleteCard,
  onMoveCard,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId, disabled: !isDesktop });

  return (
    <div ref={setNodeRef} className={`board-column${isOver ? " drop-active" : ""}`}>
      {!isDesktop && <div className="board-column-label">{STATUS_LABELS[status]}</div>}
      {cards.map((card) => (
        <BoardCard
          key={card.id}
          {...card}
          isDesktop={isDesktop}
          onStatusChange={onStatusChange}
          onRename={onRenameCard}
          onDelete={onDeleteCard}
          onMove={onMoveCard}
        />
      ))}
    </div>
  );
}
