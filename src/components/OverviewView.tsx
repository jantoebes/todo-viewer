"use client";

import { useEffect, useState } from "react";
import type { Action } from "@/lib/actions";
import { mergeBoards, translateActions } from "@/lib/multiList";
import type { BoardData } from "@/lib/types";
import { BoardView } from "./BoardView";

const POLL_INTERVAL_MS = 5000;

export function OverviewView() {
  const [boardsByList, setBoardsByList] = useState<Record<string, BoardData>>({});
  const [listOrder, setListOrder] = useState<string[]>([]);

  async function fetchAll() {
    const listsRes = await fetch("/api/lists");
    const { lists } = (await listsRes.json()) as { lists: string[] };
    const boards = await Promise.all(lists.map((list) => fetch(`/api/board?list=${encodeURIComponent(list)}`).then((r) => r.json())));
    const next: Record<string, BoardData> = {};
    lists.forEach((list, i) => (next[list] = boards[i]));
    setListOrder(lists);
    setBoardsByList(next);
  }

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const { stories, origins } = mergeBoards(boardsByList, listOrder, (list) => list);

  async function dispatchOne({ list, action }: { list: string; action: Action }) {
    const res = await fetch(`/api/board?list=${encodeURIComponent(list)}`, { method: "POST", body: JSON.stringify(action) });
    const json = await res.json();
    res.ok && setBoardsByList((prev) => ({ ...prev, [list]: json }));
  }

  function dispatch(action: Action) {
    translateActions(action, origins).forEach(dispatchOne);
  }

  return listOrder.length === 0 ? (
    <p className="meta">Laden...</p>
  ) : (
    <BoardView
      stories={stories}
      dispatch={dispatch}
      groupFilter=""
      showTasks={true}
      showBacklogColumn={false}
      showAllTasks={true}
      readOnlyGroups
      groupTasksByStory
    />
  );
}
