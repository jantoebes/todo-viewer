"use client";

import { useEffect, useState } from "react";
import type { Action } from "@/lib/actions";
import { groupsInUse } from "@/lib/derive";
import { mergeBoards, prefixGroup, translateActions } from "@/lib/multiList";
import type { BoardData } from "@/lib/types";
import { BacklogTable } from "@/components/BacklogTable";
import { BoardView } from "@/components/BoardView";
import { OverviewView } from "@/components/OverviewView";
import { SyncStatusModal } from "@/components/SyncStatusModal";
import { SyncHealthBanner } from "@/components/SyncHealthBanner";

type View = "backlog" | "board" | "overview";

const ACTIVE_LISTS_KEY = "todo-viewer:activeLists";
const POLL_INTERVAL_MS = 4000;

function readStoredLists(): string[] {
  const stored = localStorage.getItem(ACTIVE_LISTS_KEY);
  return stored ? JSON.parse(stored) : [];
}

export default function Home() {
  const [boardsByList, setBoardsByList] = useState<Record<string, BoardData>>({});
  const [view, setView] = useState<View>("backlog");
  const [error, setError] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState("");
  const [showTasks, setShowTasks] = useState(true);
  const [showBacklogColumn, setShowBacklogColumn] = useState(false);
  const [showEmptyGroups, setShowEmptyGroups] = useState(true);
  const [lists, setLists] = useState<string[]>([]);
  const [activeLists, setActiveLists] = useState<string[]>([]);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [primaryList, setPrimaryList] = useState<string | undefined>(undefined);
  const isMultiList = activeLists.length > 1;
  const loaded = activeLists.length > 0 && activeLists.every((l) => boardsByList[l] !== undefined);
  const { stories, origins } = mergeBoards(boardsByList, activeLists, (list, story) =>
    isMultiList ? prefixGroup(list, story.group || "Algemeen") : story.group
  );
  const groupOptions = groupsInUse(stories);

  function withPrimaryFirst(ls: string[], primary: string | undefined): string[] {
    return primary && ls.includes(primary) ? [primary, ...ls.filter((l) => l !== primary)] : ls;
  }

  async function fetchLists(): Promise<{ lists: string[]; primaryList?: string }> {
    const res = await fetch("/api/lists");
    const json = await res.json();
    setPrimaryList(json.primaryList);
    const ordered = withPrimaryFirst(json.lists, json.primaryList);
    setLists(ordered);
    return { lists: ordered, primaryList: json.primaryList };
  }

  async function fetchBoard(list: string) {
    const res = await fetch(`/api/board?list=${encodeURIComponent(list)}`);
    const json = await res.json();
    setBoardsByList((prev) => ({ ...prev, [list]: json }));
  }

  async function dispatchToList(list: string, action: Action) {
    const res = await fetch(`/api/board?list=${encodeURIComponent(list)}`, { method: "POST", body: JSON.stringify(action) });
    const json = await res.json();
    res.ok ? setBoardsByList((prev) => ({ ...prev, [list]: json })) : setError(json.error);
  }

  function dispatch(action: Action) {
    isMultiList
      ? translateActions(action, origins).forEach(({ list, action: translated }) => dispatchToList(list, translated))
      : dispatchToList(activeLists[0], action);
  }

  function addGroup() {
    const name = prompt(isMultiList ? `Naam van de nieuwe groep (in lijst ${activeLists[0]}):` : "Naam van de nieuwe groep:");
    name && dispatch({ type: "add_story", title: "nieuwe story", group: isMultiList ? prefixGroup(activeLists[0], name) : name });
  }

  function selectLists(next: string[]) {
    setActiveLists(next);
    setGroupFilter("");
    next.forEach(fetchBoard);
    localStorage.setItem(ACTIVE_LISTS_KEY, JSON.stringify(next));
  }

  function toggleList(list: string, checked: boolean) {
    const next = checked ? lists.filter((l) => l === list || activeLists.includes(l)) : activeLists.filter((l) => l !== list);
    next.length > 0 && selectLists(next);
  }

  async function addList() {
    const name = prompt("Naam van de nieuwe lijst (bv. prive):");
    if (name) {
      const res = await fetch("/api/lists", { method: "POST", body: JSON.stringify({ name }) });
      const json = await res.json();
      if (res.ok) {
        setLists(withPrimaryFirst(json.lists, primaryList));
        selectLists([name]);
      } else {
        setError(json.error);
      }
    }
  }

  useEffect(() => {
    fetchLists().then(({ lists: ls, primaryList: primary }) => {
      const stored = readStoredLists().filter((l) => ls.includes(l));
      const initial = stored.length > 0 ? stored : primary && ls.includes(primary) ? [primary] : ls.slice(0, 1);
      initial.length > 0 && selectLists(initial);
    });
  }, []);

  useEffect(() => {
    if (activeLists.length === 0) return;
    const interval = setInterval(() => activeLists.forEach(fetchBoard), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeLists]);

  return (
    <div>
      <div className="toolbar">
        {view !== "overview" && (
          <>
            <details className="list-picker">
              <summary>{activeLists.join(", ") || "Lijsten"}</summary>
              <div className="list-picker-menu">
                {lists.map((l) => (
                  <label key={l} className="toggle">
                    <input type="checkbox" checked={activeLists.includes(l)} onChange={(e) => toggleList(l, e.target.checked)} />
                    {l}
                  </label>
                ))}
              </div>
            </details>
            <button type="button" onClick={addList}>
              + lijst
            </button>
          </>
        )}
        <div className="tabs">
          <button type="button" className={view === "backlog" ? "active" : ""} onClick={() => setView("backlog")}>
            Backlog
          </button>
          <button type="button" className={view === "board" ? "active" : ""} onClick={() => setView("board")}>
            Bord
          </button>
          <button type="button" className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>
            Overzicht
          </button>
        </div>
        {view !== "overview" && (
          <>
            <button type="button" onClick={addGroup}>
              + groep
            </button>
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
              <option value="">Alle groepen</option>
              {groupOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <label className="toggle">
              <input type="checkbox" checked={showTasks} onChange={(e) => setShowTasks(e.target.checked)} />
              Toon taken
            </label>
          </>
        )}
        {view === "board" && (
          <>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showBacklogColumn}
                onChange={(e) => {
                  setShowBacklogColumn(e.target.checked);
                  if (e.target.checked) setShowEmptyGroups(true);
                }}
              />
              Toon backlog kolom
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showEmptyGroups}
                disabled={showBacklogColumn}
                onChange={(e) => setShowEmptyGroups(e.target.checked)}
              />
              Toon lege groepen
            </label>
          </>
        )}
        {error && <span className="error">{error}</span>}
        <button type="button" style={{ marginLeft: "auto" }} onClick={() => setShowSyncModal(true)}>
          Sync-status
        </button>
      </div>
      <SyncHealthBanner onOpen={() => setShowSyncModal(true)} />
      {showSyncModal && <SyncStatusModal onClose={() => setShowSyncModal(false)} />}
      {view === "overview" ? (
        <OverviewView />
      ) : !loaded ? (
        <p className="meta">Laden...</p>
      ) : view === "backlog" ? (
        <BacklogTable stories={stories} dispatch={dispatch} groupFilter={groupFilter} showTasks={showTasks} />
      ) : (
        <BoardView
          stories={stories}
          dispatch={dispatch}
          groupFilter={groupFilter}
          showTasks={showTasks}
          showBacklogColumn={showBacklogColumn}
          hideEmptyGroups={!showEmptyGroups}
        />
      )}
    </div>
  );
}
