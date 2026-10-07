"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import type { Action } from "@/lib/actions";
import { effectiveStatus, groupsInUse, isLaneVisible, isStandaloneCardVisible, visibleLaneTasks } from "@/lib/derive";
import { moveItem } from "@/lib/reorder";
import { BOARD_COLUMNS, STATUS_LABELS, STATUS_ORDER } from "@/lib/statuses";
import type { Status, Story } from "@/lib/types";
import { BoardLane, type LaneColumn } from "./BoardLane";
import { EditableText } from "./EditableText";

interface IndexedStory {
  story: Story;
  index: number;
}

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 769px)");
    const sync = () => setIsDesktop(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  return isDesktop;
}

function laneColumnsFor(story: Story, storyIndex: number, columns: Status[], includeBacklog: boolean): LaneColumn[] {
  const tasks = visibleLaneTasks(story, includeBacklog);
  return columns.map((status) => ({
    status,
    dropId: `lane:${storyIndex}:${status}`,
    cards: tasks
      .filter((t) => t.status === status)
      .map((t) => ({ id: `task:${storyIndex}:${story.tasks.indexOf(t)}`, title: t.title, status: t.status })),
  }));
}

interface FlatCard {
  id: string;
  title: string;
  status: Status;
}

// Losse taken (van een story die taken heeft) of de losse story zelf (geen
// taken, eigen status telt dan) — alles wat niet backlog is.
function flatCardsForStory(story: Story, storyIndex: number): FlatCard[] {
  return story.tasks.length > 0
    ? story.tasks
        .filter((t) => t.status !== "backlog")
        .map((t) => ({ id: `task:${storyIndex}:${story.tasks.indexOf(t)}`, title: t.title, status: t.status }))
    : effectiveStatus(story) !== "backlog"
      ? [{ id: `story:${storyIndex}`, title: story.title, status: story.status }]
      : [];
}

// Verzamelt de losse taken/stories van alle stories in de groep samen,
// ongeacht bij welke story/lane het hoort.
function flatCardsFor(stories: Story[], group: string): FlatCard[] {
  return stories.flatMap((story, storyIndex) => ((story.group || "Algemeen") === group ? flatCardsForStory(story, storyIndex) : []));
}

// Alleen de losse stories zonder taken (hun eigen status telt), samengevoegd
// in de algemene rij van de groep.
function flatStandaloneCardsFor(stories: Story[], group: string): FlatCard[] {
  return stories.flatMap((story, storyIndex) =>
    (story.group || "Algemeen") === group && story.tasks.length === 0 ? flatCardsForStory(story, storyIndex) : []
  );
}

interface FlatStoryEntry {
  story: Story;
  storyIndex: number;
  cards: FlatCard[];
}

// Stories mét taken breken uit de algemene rij en krijgen elk hun eigen
// kopje "groep - storytitel" i.p.v. samengevoegd te worden.
function flatStoriesFor(stories: Story[], group: string): FlatStoryEntry[] {
  return stories
    .map((story, storyIndex) => ({
      story,
      storyIndex,
      cards: (story.group || "Algemeen") === group && story.tasks.length > 0 ? flatCardsForStory(story, storyIndex) : [],
    }))
    .filter((entry) => entry.cards.length > 0);
}

function flatColumnsFor(cards: FlatCard[], groupIndex: number, columns: Status[]): LaneColumn[] {
  return columns.map((status) => ({
    status,
    dropId: `flat:${groupIndex}:${status}`,
    cards: cards.filter((c) => c.status === status),
  }));
}

function standaloneColumnsFor(entries: IndexedStory[], groupIndex: number, columns: Status[]): LaneColumn[] {
  return columns.map((status) => ({
    status,
    dropId: `standalone:${groupIndex}:${status}`,
    cards: entries
      .filter(({ story }) => story.status === status)
      .map(({ story, index }) => ({
        id: `story:${index}`,
        title: story.title,
        status: story.status,
        locked: story.tasks.length > 0,
      })),
  }));
}

function parseCardId(cardId: string): { kind: "task" | "story"; storyIndex: number; taskIndex?: number } {
  const [kind, storyIndex, taskIndex] = cardId.split(":");
  return { kind: kind as "task" | "story", storyIndex: Number(storyIndex), taskIndex: taskIndex !== undefined ? Number(taskIndex) : undefined };
}

function isCardId(id: string): boolean {
  return id.startsWith("task:") || id.startsWith("story:");
}

function groupHeaderIndex(id: string): number | undefined {
  return id.startsWith("groupheader:") ? Number(id.slice("groupheader:".length)) : undefined;
}

function laneHandleStoryIndex(id: string): number | undefined {
  return id.startsWith("lanehandle:") ? Number(id.slice("lanehandle:".length)) : undefined;
}

function containerOf(stories: Story[], groupOrder: string[], cardId: string): string {
  const parsed = parseCardId(cardId);
  return parsed.kind === "task"
    ? `lane:${parsed.storyIndex}:${stories[parsed.storyIndex].tasks[parsed.taskIndex!].status}`
    : `standalone:${groupOrder.indexOf(stories[parsed.storyIndex].group || "Algemeen")}:${stories[parsed.storyIndex].status}`;
}

function idsInContainer(stories: Story[], groupOrder: string[], containerId: string): string[] {
  const parts = containerId.split(":");
  return parts[0] === "lane"
    ? stories[Number(parts[1])].tasks
        .map((t, j) => (t.status === parts[2] ? `task:${parts[1]}:${j}` : undefined))
        .filter((id): id is string => id !== undefined)
    : stories
        .map((s, i) =>
          s.tasks.length === 0 && groupOrder.indexOf(s.group || "Algemeen") === Number(parts[1]) && s.status === parts[2]
            ? `story:${i}`
            : undefined
        )
        .filter((id): id is string => id !== undefined);
}

function toReorderAction(containerId: string, orderedIds: string[]): Action {
  return containerId.startsWith("lane:")
    ? {
        type: "reorder_tasks",
        storyIndex: Number(containerId.split(":")[1]),
        orderedIndexes: orderedIds.map((id) => parseCardId(id).taskIndex!),
      }
    : { type: "reorder_stories", orderedIndexes: orderedIds.map((id) => parseCardId(id).storyIndex) };
}

function resolveCrossContainerDrop(
  stories: Story[],
  groupOrder: string[],
  activeId: string,
  targetContainerId: string,
  readOnlyGroups?: boolean
): Action {
  const parts = targetContainerId.split(":");
  const status = parts[parts.length - 1] as Status;
  const targetStoryIndex = parts[0] === "lane" ? Number(parts[1]) : undefined;
  const targetGroupIndex = parts[0] === "standalone" ? Number(parts[1]) : undefined;
  const targetGroup = targetGroupIndex !== undefined ? groupOrder[targetGroupIndex] : undefined;
  const source = parseCardId(activeId);
  const sourceGroup = stories[source.storyIndex].group || "Algemeen";
  const targetStoryGroup = targetStoryIndex !== undefined ? stories[targetStoryIndex].group || "Algemeen" : undefined;

  // In readOnlyGroups-modus (bv. het cross-lijst overzicht) staat "groep" voor een
  // andere onderliggende lijst — verplaatsen ertussen heeft geen betekenis, dus
  // vallen we terug op een gewone statuswijziging i.p.v. move/convert-acties.
  if (readOnlyGroups && ((targetStoryGroup !== undefined && targetStoryGroup !== sourceGroup) || (targetGroup !== undefined && targetGroup !== sourceGroup))) {
    return source.kind === "task"
      ? { type: "update_task", storyIndex: source.storyIndex, taskIndex: source.taskIndex!, patch: { status } }
      : { type: "update_story", index: source.storyIndex, patch: { status } };
  }

  return targetStoryIndex !== undefined && source.kind === "task" && source.storyIndex !== targetStoryIndex
    ? { type: "move_task", fromStoryIndex: source.storyIndex, taskIndex: source.taskIndex!, toStoryIndex: targetStoryIndex, status }
    : targetStoryIndex !== undefined && source.kind === "story"
      ? { type: "convert_story_to_task", storyIndex: source.storyIndex, toStoryIndex: targetStoryIndex, status }
      : targetGroup !== undefined && source.kind === "task"
        ? { type: "convert_task_to_story", storyIndex: source.storyIndex, taskIndex: source.taskIndex!, status }
        : targetGroup !== undefined && source.kind === "story" && targetGroup !== sourceGroup
          ? { type: "move_story_to_group", storyIndex: source.storyIndex, group: targetGroup, toIndex: 0, status }
          : source.kind === "task"
            ? { type: "update_task", storyIndex: source.storyIndex, taskIndex: source.taskIndex!, patch: { status } }
            : { type: "update_story", index: source.storyIndex, patch: { status } };
}

function resolveCardDrag(
  stories: Story[],
  groupOrder: string[],
  activeId: string,
  overId: string,
  readOnlyGroups?: boolean
): Action | undefined {
  const targetContainer = isCardId(overId) ? containerOf(stories, groupOrder, overId) : overId;
  const sourceContainer = containerOf(stories, groupOrder, activeId);
  const ids = idsInContainer(stories, groupOrder, targetContainer);

  return !isCardId(activeId)
    ? undefined
    : sourceContainer === targetContainer && isCardId(overId)
      ? toReorderAction(targetContainer, moveItem(ids, ids.indexOf(activeId), ids.indexOf(overId)))
      : resolveCrossContainerDrop(stories, groupOrder, activeId, targetContainer, readOnlyGroups);
}

function resolveGroupHeaderDrag(groupOrder: string[], activeId: string, overId: string): Action | undefined {
  const from = groupHeaderIndex(activeId);
  const to = groupHeaderIndex(overId);
  return from !== undefined && to !== undefined
    ? { type: "reorder_groups", orderedGroups: moveItem(groupOrder, from, to) }
    : undefined;
}

function resolveLaneDrag(
  stories: Story[],
  groupOrder: string[],
  laneHandleIdsFor: (group: string) => string[],
  activeId: string,
  overId: string
): Action | undefined {
  const fromStoryIndex = laneHandleStoryIndex(activeId);
  const toStoryIndex = laneHandleStoryIndex(overId);
  const toGroupIndex = groupHeaderIndex(overId);
  const fromGroup = fromStoryIndex !== undefined ? stories[fromStoryIndex].group || "Algemeen" : undefined;
  const toGroup = toStoryIndex !== undefined ? stories[toStoryIndex].group || "Algemeen" : toGroupIndex !== undefined ? groupOrder[toGroupIndex] : undefined;

  const sameGroupReorder =
    fromStoryIndex !== undefined && toStoryIndex !== undefined && fromGroup === toGroup
      ? (() => {
          const ids = laneHandleIdsFor(fromGroup ?? "Algemeen");
          return {
            type: "reorder_stories" as const,
            orderedIndexes: moveItem(ids, ids.indexOf(`lanehandle:${fromStoryIndex}`), ids.indexOf(`lanehandle:${toStoryIndex}`)).map(
              (id) => Number(id.split(":")[1])
            ),
          };
        })()
      : undefined;

  const crossGroupMove =
    fromStoryIndex !== undefined && toGroup !== undefined && fromGroup !== toGroup
      ? { type: "move_story_to_group" as const, storyIndex: fromStoryIndex, group: toGroup, toIndex: 0 }
      : undefined;

  return sameGroupReorder ?? crossGroupMove;
}

function BoardGroupHeader({
  groupIndex,
  group,
  onRename,
  onAddStory,
  readOnly,
}: {
  groupIndex: number;
  group: string;
  onRename: (newName: string) => void;
  onAddStory: () => void;
  readOnly?: boolean;
}) {
  const id = `groupheader:${groupIndex}`;
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id, disabled: readOnly });
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({ id, disabled: readOnly });

  return (
    <div ref={setDropRef} className={`board-group-header${isOver ? " drop-target" : ""}`}>
      {!readOnly && (
        <span ref={setDragRef} className="board-lane-grip" {...attributes} {...listeners}>
          ⠿
        </span>
      )}
      {readOnly ? <span className="board-group-title">{group}</span> : <EditableText className="board-group-title" value={group} onCommit={onRename} />}
      {!readOnly && (
        <button type="button" onClick={onAddStory}>
          + story
        </button>
      )}
    </div>
  );
}

interface BoardViewProps {
  stories: Story[];
  dispatch: (action: Action) => void;
  groupFilter: string;
  showTasks: boolean;
  showBacklogColumn: boolean;
  showAllTasks?: boolean;
  hideEmptyGroups?: boolean;
  readOnlyGroups?: boolean;
  groupTasksByStory?: boolean;
}

export function BoardView({
  stories,
  dispatch,
  groupFilter,
  showTasks,
  showBacklogColumn,
  showAllTasks = false,
  hideEmptyGroups = false,
  readOnlyGroups,
  groupTasksByStory,
}: BoardViewProps) {
  const isDesktop = useIsDesktop();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const columns = showBacklogColumn ? STATUS_ORDER : BOARD_COLUMNS;
  const groupOrder = groupsInUse(stories);
  const visibleGroups = groupFilter ? groupOrder.filter((g) => g === groupFilter) : groupOrder;

  const indexed: IndexedStory[] = stories.map((story, index) => ({ story, index }));

  function lanesFor(group: string): IndexedStory[] {
    return showTasks
      ? indexed.filter(({ story }) => (story.group || "Algemeen") === group && isLaneVisible(story, showBacklogColumn))
      : [];
  }

  function standaloneFor(group: string): IndexedStory[] {
    return showTasks
      ? indexed.filter(({ story }) => (story.group || "Algemeen") === group && isStandaloneCardVisible(story, showBacklogColumn))
      : indexed.filter(({ story }) => (story.group || "Algemeen") === group && (showBacklogColumn || story.status !== "backlog"));
  }

  function hasVisibleCards(group: string): boolean {
    return showAllTasks
      ? groupTasksByStory
        ? flatStandaloneCardsFor(stories, group).length > 0 || flatStoriesFor(stories, group).length > 0
        : flatCardsFor(stories, group).length > 0
      : standaloneFor(group).length > 0 || lanesFor(group).length > 0;
  }

  const renderedGroups = showAllTasks || hideEmptyGroups ? visibleGroups.filter(hasVisibleCards) : visibleGroups;

  function laneHandleIdsFor(group: string): string[] {
    return lanesFor(group).map(({ index }) => `lanehandle:${index}`);
  }

  function setCardStatus(cardId: string, status: Status) {
    const parsed = parseCardId(cardId);
    dispatch(
      parsed.kind === "task"
        ? { type: "update_task", storyIndex: parsed.storyIndex, taskIndex: parsed.taskIndex!, patch: { status } }
        : { type: "update_story", index: parsed.storyIndex, patch: { status } }
    );
  }

  function renameCard(cardId: string, title: string) {
    const parsed = parseCardId(cardId);
    dispatch(
      parsed.kind === "task"
        ? { type: "update_task", storyIndex: parsed.storyIndex, taskIndex: parsed.taskIndex!, patch: { title } }
        : { type: "update_story", index: parsed.storyIndex, patch: { title } }
    );
  }

  function deleteCard(cardId: string) {
    const parsed = parseCardId(cardId);
    confirm("Verwijderen?") &&
      dispatch(
        parsed.kind === "task"
          ? { type: "delete_task", storyIndex: parsed.storyIndex, taskIndex: parsed.taskIndex! }
          : { type: "delete_story", index: parsed.storyIndex }
      );
  }

  function addTask(storyIndex: number) {
    dispatch({ type: "add_task", storyIndex, title: "nieuwe taak", status: showBacklogColumn ? "backlog" : "to_do" });
  }

  function addStoryToGroup(group: string) {
    dispatch({ type: "add_story", title: "nieuwe story", group, status: showBacklogColumn ? "backlog" : "to_do" });
  }

  function renameGroup(group: string, newName: string) {
    newName && newName !== group && dispatch({ type: "rename_group", group, newName });
  }

  function moveCardHandler(cardId: string, direction: -1 | 1) {
    const container = containerOf(stories, groupOrder, cardId);
    const ids = idsInContainer(stories, groupOrder, container);
    const from = ids.indexOf(cardId);
    const to = from + direction;
    const action = to >= 0 && to < ids.length ? toReorderAction(container, moveItem(ids, from, to)) : undefined;
    action && dispatch(action);
  }

  function moveLaneHandler(storyIndex: number, direction: -1 | 1) {
    const group = stories[storyIndex].group || "Algemeen";
    const ids = laneHandleIdsFor(group);
    const handleId = `lanehandle:${storyIndex}`;
    const from = ids.indexOf(handleId);
    const to = from + direction;
    const inBounds = from !== -1 && to >= 0 && to < ids.length;
    inBounds &&
      dispatch({
        type: "reorder_stories",
        orderedIndexes: moveItem(ids, from, to).map((id) => Number(id.split(":")[1])),
      });
  }

  function onDragEnd(event: DragEndEvent) {
    const overId = event.over ? String(event.over.id) : undefined;
    const activeId = String(event.active.id);
    const action = overId
      ? (readOnlyGroups ? undefined : resolveGroupHeaderDrag(groupOrder, activeId, overId)) ??
        (readOnlyGroups ? undefined : resolveLaneDrag(stories, groupOrder, laneHandleIdsFor, activeId, overId)) ??
        resolveCardDrag(stories, groupOrder, activeId, overId, readOnlyGroups)
      : undefined;
    action && dispatch(action);
  }

  return (
    <div className="board">
      <DndContext sensors={isDesktop ? sensors : []} onDragEnd={onDragEnd}>
        {isDesktop && (
          <div className="board-header-row" style={{ "--board-cols": columns.length } as CSSProperties}>
            <div className="board-lane-label" />
            {columns.map((status) => (
              <div key={status} className="board-column-label">
                {STATUS_LABELS[status]}
              </div>
            ))}
          </div>
        )}
        {renderedGroups.map((group) => (
          <div key={group} className="board-group">
            <BoardGroupHeader
              groupIndex={groupOrder.indexOf(group)}
              group={group}
              onRename={(newName) => renameGroup(group, newName)}
              onAddStory={() => addStoryToGroup(group)}
              readOnly={readOnlyGroups}
            />
            <div className={isDesktop ? "board-grid" : "board-stack"} style={{ "--board-cols": columns.length } as CSSProperties}>
              {showAllTasks && groupTasksByStory ? (
                <>
                  {flatStandaloneCardsFor(stories, group).length > 0 && (
                    <BoardLane
                      label={null}
                      columns={flatColumnsFor(flatStandaloneCardsFor(stories, group), groupOrder.indexOf(group), columns)}
                      isDesktop={isDesktop}
                      onStatusChange={setCardStatus}
                      onRenameCard={renameCard}
                      onDeleteCard={deleteCard}
                      onMoveCard={moveCardHandler}
                    />
                  )}
                  {flatStoriesFor(stories, group).map(({ story, storyIndex, cards }) => (
                    <BoardLane
                      key={storyIndex}
                      label={`${group} - ${story.title}`}
                      columns={flatColumnsFor(cards, storyIndex, columns)}
                      isDesktop={isDesktop}
                      onStatusChange={setCardStatus}
                      onRenameCard={renameCard}
                      onDeleteCard={deleteCard}
                      onMoveCard={moveCardHandler}
                    />
                  ))}
                </>
              ) : showAllTasks ? (
                <BoardLane
                  label={null}
                  columns={flatColumnsFor(flatCardsFor(stories, group), groupOrder.indexOf(group), columns)}
                  isDesktop={isDesktop}
                  onStatusChange={setCardStatus}
                  onRenameCard={renameCard}
                  onDeleteCard={deleteCard}
                  onMoveCard={moveCardHandler}
                />
              ) : (
                <>
                  <BoardLane
                    label="Losse stories"
                    columns={standaloneColumnsFor(standaloneFor(group), groupOrder.indexOf(group), columns)}
                    isDesktop={isDesktop}
                    onStatusChange={setCardStatus}
                    onRenameCard={renameCard}
                    onDeleteCard={deleteCard}
                    onMoveCard={moveCardHandler}
                  />
                  {lanesFor(group).map(({ story, index }) => (
                    <BoardLane
                      key={index}
                      label={story.title}
                      storyIndex={index}
                      columns={laneColumnsFor(story, index, columns, showBacklogColumn)}
                      isDesktop={isDesktop}
                      onStatusChange={setCardStatus}
                      onRenameCard={renameCard}
                      onDeleteCard={deleteCard}
                      onMoveCard={moveCardHandler}
                      onAddTask={addTask}
                      onMoveLane={moveLaneHandler}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        ))}
      </DndContext>
    </div>
  );
}
