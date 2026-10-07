"use client";

import { useEffect, useState } from "react";
import { LoginPanel } from "./LoginPanel";

interface ListSyncStatus {
  lastReconcileAt?: string;
  lastError?: string;
}

interface SyncInfo {
  status: Record<string, ListSyncStatus>;
  reconcileIntervalMs: number;
  lists: string[];
  activeSyncHost?: string;
  thisHost: string;
}

type IssueKind = "login" | "stale" | "error";

interface Issue {
  kind: IssueKind;
  text: string;
}

const MIN_STALE_MS = 15 * 60_000;
const POLL_MS = 30_000;
const LOGIN_ERROR_PATTERN = /login verlopen|Graph 401|InvalidAuthenticationToken|interaction_required|invalid_grant/i;

function isSyncHost(info: SyncInfo): boolean {
  return !info.activeSyncHost || info.activeSyncHost === info.thisHost;
}

function staleThresholdMs(info: SyncInfo): number {
  return Math.max(MIN_STALE_MS, info.reconcileIntervalMs * 3);
}

function formatSince(value: string | undefined): string {
  return value ? new Date(value).toLocaleString("nl-NL") : "ooit";
}

function errorIssue(list: string, error: string): Issue {
  return LOGIN_ERROR_PATTERN.test(error)
    ? { kind: "login", text: `${list}: Microsoft-login verlopen` }
    : { kind: "error", text: `${list}: ${error}` };
}

function listIssue(info: SyncInfo, list: string, now: number): Issue | undefined {
  const s = info.status[list] ?? {};
  const lastReconcile = s.lastReconcileAt ? new Date(s.lastReconcileAt).getTime() : 0;
  const stale = now - lastReconcile > staleThresholdMs(info);
  return s.lastError
    ? errorIssue(list, s.lastError)
    : stale
      ? { kind: "stale", text: `${list}: geen geslaagde sync sinds ${formatSince(s.lastReconcileAt)} — sync-proces draait mogelijk niet` }
      : undefined;
}

function issuesOf(info: SyncInfo): Issue[] {
  const now = Date.now();
  return isSyncHost(info)
    ? info.lists.map((list) => listIssue(info, list, now)).filter((i): i is Issue => i !== undefined)
    : [];
}

function hasKind(issues: Issue[], kind: IssueKind): boolean {
  return issues.some((i) => i.kind === kind);
}

function ForceSyncButton() {
  const [running, setRunning] = useState(false);
  const run = () => {
    setRunning(true);
    fetch("/api/sync/force", { method: "POST" }).finally(() => setRunning(false));
  };
  return (
    <button type="button" onClick={run} disabled={running}>
      {running ? "Sync loopt..." : "Volledige sync forceren"}
    </button>
  );
}

export function SyncHealthBanner({ onOpen }: { onOpen: () => void }) {
  const [issues, setIssues] = useState<Issue[]>([]);

  useEffect(() => {
    const load = () =>
      fetch("/api/sync")
        .then((res) => res.json() as Promise<SyncInfo>)
        .then((info) => setIssues(issuesOf(info)))
        .catch(() => setIssues([{ kind: "error", text: "Sync-status niet op te halen" }]));
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  return issues.length > 0 ? (
    <div
      role="alert"
      style={{
        background: "#fde8e8",
        borderLeft: "4px solid crimson",
        color: "crimson",
        padding: "2px 8px",
        fontSize: "0.8rem",
        display: "flex",
        flexWrap: "wrap",
        gap: "0.5rem",
        alignItems: "center",
      }}
    >
      <strong>Sync hapert</strong>
      <span>{issues.map((i) => i.text).join(" · ")}</span>
      {hasKind(issues, "login") && <LoginPanel />}
      {!hasKind(issues, "login") && <ForceSyncButton />}
      <button type="button" onClick={onOpen}>
        Details
      </button>
    </div>
  ) : null;
}
