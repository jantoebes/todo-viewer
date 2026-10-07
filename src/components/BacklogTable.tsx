"use client";

import { useMemo, useRef, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
  type ColumnFiltersState,
  type RowSelectionState,
  type FilterFn,
  type SortingFn,
  type Row as RTRow,
  type Table,
} from "@tanstack/react-table";
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import type { Action } from "@/lib/actions";
import { groupsInUse } from "@/lib/derive";
import { moveItem } from "@/lib/reorder";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/statuses";
import type { Status, Story } from "@/lib/types";
import { BulkActionBar } from "./BulkActionBar";
import { ChipsMultiSelect } from "./ChipsMultiSelect";
import { EditableText } from "./EditableText";

export interface Row {
  id: string;
  kind: "story" | "task";
  storyIndex: number;
  taskIndex?: number;
  title: string;
  group: string;
  status: Status;
  hasTasks: boolean;
}

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    hideFilterUI?: boolean;
  }
}

function buildRows(stories: Story[]): Row[] {
  return stories.flatMap((s, storyIndex) => [
    { id: `${storyIndex}`, kind: "story" as const, storyIndex, title: s.title, group: s.group || "Algemeen", status: s.status, hasTasks: s.tasks.length > 0 },
    ...s.tasks.map((t, taskIndex) => ({
      id: `${storyIndex}:${taskIndex}`,
      kind: "task" as const,
      storyIndex,
      taskIndex,
      title: t.title,
      group: s.group || "Algemeen",
      status: t.status,
      hasTasks: false,
    })),
  ]);
}

const statusFilter: FilterFn<Row> = (row, columnId, filterValue) => {
  const labels = filterValue as string[];
  return !labels || labels.length === 0 || labels.includes(STATUS_LABELS[row.getValue<Status>(columnId)]);
};

const titleFilter: FilterFn<Row> = (row, columnId, filterValue) =>
  !filterValue || String(row.getValue(columnId)).toLowerCase().includes(String(filterValue).toLowerCase());

const statusSort: SortingFn<Row> = (rowA, rowB, columnId) =>
  STATUS_ORDER.indexOf(rowA.getValue<Status>(columnId)) - STATUS_ORDER.indexOf(rowB.getValue<Status>(columnId));

const CHAR_PX = 7.3;
const CELL_PADDING = 18;

function widthFor(header: string, values: string[], min: number, max: number): number {
  const longest = Math.max(header.length + 2, ...values.map((v) => v.length));
  return Math.min(max, Math.max(min, Math.round((longest + 1) * CHAR_PX + CELL_PADDING)));
}

const GROUP_HEADER_PREFIX = "groupheader:";

function groupHeaderId(id: string): string | undefined {
  return id.startsWith(GROUP_HEADER_PREFIX) ? id.slice(GROUP_HEADER_PREFIX.length) : undefined;
}

function reorderStoriesAction(displayRows: Row[], fromStoryIndex: number, toStoryIndex: number): Action {
  const storyIndexes = displayRows.filter((r) => r.kind === "story").map((r) => r.storyIndex);
  return {
    type: "reorder_stories",
    orderedIndexes: moveItem(storyIndexes, storyIndexes.indexOf(fromStoryIndex), storyIndexes.indexOf(toStoryIndex)),
  };
}

function reorderTasksAction(displayRows: Row[], storyIndex: number, fromTaskIndex: number, toTaskIndex: number): Action {
  const taskIndexes = displayRows.filter((r) => r.kind === "task" && r.storyIndex === storyIndex).map((r) => r.taskIndex ?? 0);
  return {
    type: "reorder_tasks",
    storyIndex,
    orderedIndexes: moveItem(taskIndexes, taskIndexes.indexOf(fromTaskIndex), taskIndexes.indexOf(toTaskIndex)),
  };
}

function reorderGroupsAction(groupOrder: string[], fromGroup: string, toGroup: string): Action {
  return {
    type: "reorder_groups",
    orderedGroups: moveItem(groupOrder, groupOrder.indexOf(fromGroup), groupOrder.indexOf(toGroup)),
  };
}

function moveStoryToGroupAction(storyIndex: number, group: string, toIndex: number): Action {
  return { type: "move_story_to_group", storyIndex, group, toIndex };
}

function reorderRowAction(displayRows: Row[], groupOrder: string[], activeId: string, overId: string): Action | undefined {
  const activeGroupHeader = groupHeaderId(activeId);
  const overGroupHeader = groupHeaderId(overId);
  const active = displayRows.find((r) => r.id === activeId);
  const over = displayRows.find((r) => r.id === overId);

  const groupReorder =
    activeGroupHeader !== undefined && overGroupHeader !== undefined
      ? reorderGroupsAction(groupOrder, activeGroupHeader, overGroupHeader)
      : undefined;

  const dropOnHeader =
    active?.kind === "story" && overGroupHeader !== undefined ? moveStoryToGroupAction(active.storyIndex, overGroupHeader, 0) : undefined;

  const sameGroupStoryReorder =
    active?.kind === "story" && over?.kind === "story" && active.group === over.group
      ? reorderStoriesAction(displayRows, active.storyIndex, over.storyIndex)
      : undefined;

  const crossGroupStoryMove =
    active?.kind === "story" && over?.kind === "story" && active.group !== over.group
      ? moveStoryToGroupAction(
          active.storyIndex,
          over.group,
          displayRows.filter((r) => r.kind === "story" && r.group === over.group).findIndex((r) => r.storyIndex === over.storyIndex)
        )
      : undefined;

  const taskReorder =
    active?.kind === "task" && over?.kind === "task" && active.storyIndex === over.storyIndex
      ? reorderTasksAction(displayRows, active.storyIndex, active.taskIndex ?? 0, over.taskIndex ?? 0)
      : undefined;

  return groupReorder ?? dropOnHeader ?? sameGroupStoryReorder ?? crossGroupStoryMove ?? taskReorder;
}

const columnHelper = createColumnHelper<Row>();

interface DragHandleProps {
  enabled: boolean;
  setDragRef: (node: HTMLElement | null) => void;
  attributes: ReturnType<typeof useDraggable>["attributes"];
  listeners: ReturnType<typeof useDraggable>["listeners"];
}

function DragHandle({ enabled, setDragRef, attributes, listeners }: DragHandleProps) {
  return (
    <span
      ref={setDragRef}
      className={`row-grip${enabled ? "" : " row-grip-disabled"}`}
      title={enabled ? "Sleep om te verplaatsen" : "Zet sortering uit om te verplaatsen"}
      {...(enabled ? attributes : {})}
      {...(enabled ? listeners : {})}
    >
      ⠿
    </span>
  );
}

function BacklogRow({ tableRow, reorderEnabled }: { tableRow: RTRow<Row>; reorderEnabled: boolean }) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: tableRow.id, disabled: !reorderEnabled });
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({ id: tableRow.id, disabled: !reorderEnabled });

  return (
    <tr
      ref={setDropRef}
      className={`${tableRow.original.kind === "task" ? "task-row" : "story-row"}${isOver ? " drop-target" : ""}`}
    >
      {tableRow.getVisibleCells().map((cell) => (
        <td key={cell.id} className={`col-${cell.column.id}`}>
          {cell.column.id === "reorder" ? (
            <DragHandle enabled={reorderEnabled} setDragRef={setDragRef} attributes={attributes} listeners={listeners} />
          ) : (
            flexRender(cell.column.columnDef.cell, cell.getContext())
          )}
        </td>
      ))}
    </tr>
  );
}

interface GroupHeaderRowProps {
  group: string;
  columnCount: number;
  reorderEnabled: boolean;
  onRename: (newName: string) => void;
  onAddStory: () => void;
}

function GroupHeaderRow({ group, columnCount, reorderEnabled, onRename, onAddStory }: GroupHeaderRowProps) {
  const id = `${GROUP_HEADER_PREFIX}${group}`;
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id, disabled: !reorderEnabled });
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({ id, disabled: !reorderEnabled });

  return (
    <tr ref={setDropRef} className={`group-header-row${isOver ? " drop-target" : ""}`}>
      <td colSpan={columnCount}>
        <div className="group-header-content">
          <DragHandle enabled={reorderEnabled} setDragRef={setDragRef} attributes={attributes} listeners={listeners} />
          <EditableText className="group-header-title" value={group} onCommit={onRename} />
          <button type="button" onClick={onAddStory}>
            + story
          </button>
        </div>
      </td>
    </tr>
  );
}

interface BacklogTableProps {
  stories: Story[];
  dispatch: (action: Action) => void;
  groupFilter: string;
  showTasks: boolean;
}

export function BacklogTable({ stories, dispatch, groupFilter, showTasks }: BacklogTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const lastSelectedIdRef = useRef<string | null>(null);
  const shiftPressedRef = useRef(false);
  const reorderEnabled = sorting.length === 0;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const allRows = useMemo(() => buildRows(stories), [stories]);
  const rows = useMemo(() => (showTasks ? allRows : allRows.filter((r) => r.kind === "story")), [allRows, showTasks]);
  const groupOrder = useMemo(() => groupsInUse(stories), [stories]);
  const visibleGroups = groupFilter ? groupOrder.filter((g) => g === groupFilter) : groupOrder;

  function runAction(action: Action) {
    dispatch(action);
    setRowSelection({});
  }

  function commitStatus(row: Row, status: Status) {
    runAction(
      row.kind === "story"
        ? { type: "update_story", index: row.storyIndex, patch: { status } }
        : { type: "update_task", storyIndex: row.storyIndex, taskIndex: row.taskIndex!, patch: { status } }
    );
  }

  function commitTitle(row: Row, title: string) {
    runAction(
      row.kind === "story"
        ? { type: "update_story", index: row.storyIndex, patch: { title } }
        : { type: "update_task", storyIndex: row.storyIndex, taskIndex: row.taskIndex!, patch: { title } }
    );
  }

  function addTask(storyIndex: number) {
    runAction({ type: "add_task", storyIndex, title: "nieuwe taak" });
  }

  function addStoryToGroup(group: string) {
    runAction({ type: "add_story", title: "nieuwe story", group });
  }

  function renameGroup(group: string, newName: string) {
    newName && newName !== group && runAction({ type: "rename_group", group, newName });
  }

  function removeRow(row: Row) {
    confirm(`"${row.title}" verwijderen?`) &&
      runAction(
        row.kind === "story"
          ? { type: "delete_story", index: row.storyIndex }
          : { type: "delete_task", storyIndex: row.storyIndex, taskIndex: row.taskIndex! }
      );
  }

  function handleRowSelect(table: Table<Row>, rowId: string, shiftKey: boolean) {
    const displayedIds = table.getRowModel().rows.map((r) => r.id);
    const anchorIndex = lastSelectedIdRef.current ? displayedIds.indexOf(lastSelectedIdRef.current) : -1;
    const rowIndex = displayedIds.indexOf(rowId);
    const range = anchorIndex !== -1 && shiftKey;
    const rangeIds = range ? displayedIds.slice(Math.min(anchorIndex, rowIndex), Math.max(anchorIndex, rowIndex) + 1) : [rowId];

    setRowSelection((prev) =>
      range ? { ...prev, ...Object.fromEntries(rangeIds.map((id) => [id, true])) } : { ...prev, [rowId]: !prev[rowId] }
    );
    lastSelectedIdRef.current = rowId;
  }

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "reorder",
        header: "",
        meta: { hideFilterUI: true },
        cell: () => null,
      }),
      columnHelper.display({
        id: "select",
        header: ({ table }) => (
          <input type="checkbox" checked={table.getIsAllRowsSelected()} onChange={table.getToggleAllRowsSelectedHandler()} />
        ),
        cell: ({ row, table }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onMouseDown={(e) => {
              shiftPressedRef.current = e.shiftKey;
            }}
            onChange={() => handleRowSelect(table, row.id, shiftPressedRef.current)}
          />
        ),
        meta: { hideFilterUI: true },
      }),
      columnHelper.accessor((row) => (row.kind === "story" ? "Story" : "Taak"), {
        id: "type",
        header: "Type",
        meta: { hideFilterUI: true },
        cell: ({ row }) => (
          <span className={`type-badge type-badge-${row.original.kind}`}>{row.original.kind === "story" ? "Story" : "Taak"}</span>
        ),
      }),
      columnHelper.accessor("title", {
        header: "Titel",
        filterFn: titleFilter,
        cell: ({ row }) => (
          <span className="title-cell">
            {row.original.kind === "task" && <span className="task-indent">↳</span>}
            <EditableText value={row.original.title} onCommit={(v) => commitTitle(row.original, v)} />
          </span>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        filterFn: statusFilter,
        sortingFn: statusSort,
        cell: ({ row }) =>
          row.original.hasTasks ? (
            <span>{STATUS_LABELS[row.original.status]}</span>
          ) : (
            <select value={row.original.status} onChange={(e) => commitStatus(row.original, e.target.value as Status)}>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          ),
      }),
      columnHelper.display({
        id: "acties",
        header: "Acties",
        meta: { hideFilterUI: true },
        cell: ({ row }) => (
          <>
            {row.original.kind === "story" && (
              <button type="button" onClick={() => addTask(row.original.storyIndex)}>
                + taak
              </button>
            )}
            <button type="button" onClick={() => removeRow(row.original)}>
              verwijderen
            </button>
          </>
        ),
      }),
    ],
    []
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnFilters, rowSelection },
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  function handleDragEnd(event: DragEndEvent) {
    const overId = event.over ? String(event.over.id) : undefined;
    const activeId = String(event.active.id);
    const displayRows = table.getRowModel().rows.map((r) => r.original);
    const action = overId ? reorderRowAction(displayRows, groupOrder, activeId, overId) : undefined;
    action && runAction(action);
  }

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const filteredRows = table.getFilteredRowModel().rows.map((r) => r.original);

  const colWidths = useMemo(
    () => ({
      reorder: 22,
      select: 26,
      type: widthFor("Type", filteredRows.map((r) => (r.kind === "story" ? "Story" : "Taak")), 45, 60),
      title: widthFor("Titel", filteredRows.map((r) => r.title), 160, 420),
      status: widthFor("Status", filteredRows.map((r) => STATUS_LABELS[r.status]), 80, 130),
    }),
    [filteredRows]
  );

  function bulkMoveGroup(group: string) {
    const storyIndexes = selectedRows.filter((r) => r.kind === "story").map((r) => r.storyIndex);
    storyIndexes.length > 0 && runAction({ type: "bulk_move_group", storyIndexes, group });
  }

  function bulkSetStatus(status: Status) {
    const targets = selectedRows.filter((r) => !r.hasTasks).map((r) => ({ storyIndex: r.storyIndex, taskIndex: r.taskIndex }));
    runAction({ type: "bulk_set_status", targets, status });
  }

  function bulkDelete() {
    confirm(`${selectedRows.length} item(s) verwijderen?`) &&
      runAction({ type: "bulk_delete", targets: selectedRows.map((r) => ({ storyIndex: r.storyIndex, taskIndex: r.taskIndex })) });
  }

  function bulkConvertToTask(toStoryIndex: number) {
    const storyIndexes = selectedRows.filter((r) => r.kind === "story" && !r.hasTasks).map((r) => r.storyIndex);
    storyIndexes.length > 0 && runAction({ type: "bulk_convert_to_task", storyIndexes, toStoryIndex });
  }

  function bulkConvertToStory() {
    const targets = selectedRows.filter((r) => r.kind === "task").map((r) => ({ storyIndex: r.storyIndex, taskIndex: r.taskIndex }));
    targets.length > 0 && runAction({ type: "bulk_convert_to_story", targets });
  }

  const storyOptions = useMemo(
    () =>
      stories
        .map((s, index) => ({ index, title: s.title }))
        .filter(({ index }) => !selectedRows.some((r) => r.kind === "story" && r.storyIndex === index)),
    [stories, selectedRows]
  );

  const columnCount = table.getHeaderGroups()[0].headers.length;

  return (
    <div>
      <div className="reorder-indicator">
        {reorderEnabled ? (
          <span className="reorder-indicator-on">↕ Volgorde aanpassen: aan — sleep aan ⠿ om te verplaatsen</span>
        ) : (
          <span className="reorder-indicator-off">↕ Volgorde aanpassen: uit — zet sortering uit (klik kolomkop) om te verplaatsen</span>
        )}
      </div>
      {selectedRows.length > 0 && (
        <BulkActionBar
          selectedRows={selectedRows}
          groupOptions={groupOrder}
          storyOptions={storyOptions}
          onMoveGroup={bulkMoveGroup}
          onSetStatus={bulkSetStatus}
          onDelete={bulkDelete}
          onConvertToTask={bulkConvertToTask}
          onConvertToStory={bulkConvertToStory}
        />
      )}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <table className="grid">
          <colgroup>
            {table.getHeaderGroups()[0].headers.map((header) => (
              <col key={header.id} style={colWidths[header.column.id as keyof typeof colWidths] ? { width: colWidths[header.column.id as keyof typeof colWidths] } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {table.getHeaderGroups()[0].headers.map((header) => (
                <th key={header.id} onClick={header.column.getToggleSortingHandler()}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? ""}
                </th>
              ))}
            </tr>
            <tr className="filter-row">
              {table.getHeaderGroups()[0].headers.map((header) =>
                header.column.columnDef.meta?.hideFilterUI ? (
                  <th key={header.id} />
                ) : header.column.id === "status" ? (
                  <th key={header.id}>
                    <ChipsMultiSelect
                      options={Object.values(STATUS_LABELS)}
                      value={(header.column.getFilterValue() as string[]) ?? []}
                      onChange={(v) => header.column.setFilterValue(v.length ? v : undefined)}
                    />
                  </th>
                ) : (
                  <th key={header.id}>
                    <input
                      value={(header.column.getFilterValue() as string) ?? ""}
                      onChange={(e) => header.column.setFilterValue(e.target.value || undefined)}
                      placeholder="filter..."
                    />
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {visibleGroups.flatMap((group) => [
              <GroupHeaderRow
                key={`group:${group}`}
                group={group}
                columnCount={columnCount}
                reorderEnabled={reorderEnabled}
                onRename={(newName) => renameGroup(group, newName)}
                onAddStory={() => addStoryToGroup(group)}
              />,
              ...table
                .getRowModel()
                .rows.filter((row) => row.original.group === group)
                .map((row) => <BacklogRow key={row.id} tableRow={row} reorderEnabled={reorderEnabled} />),
            ])}
          </tbody>
        </table>
      </DndContext>
      <div className="keyboard-hint">
        <div>
          <kbd>Shift</kbd>+klik op ☑: reeks selecteren
        </div>
        <div>Klik op ☑: rij toevoegen/verwijderen uit selectie</div>
        <div>⠿ slepen: story/taak/groep verplaatsen (sortering moet uit staan)</div>
      </div>
    </div>
  );
}
