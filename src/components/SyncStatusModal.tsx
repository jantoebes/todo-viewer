"use client";

import { useEffect, useState } from "react";
import { LoginPanel } from "./LoginPanel";

interface ListSyncStatus {
  lastPushAt?: string;
  lastPullAt?: string;
  lastReconcileAt?: string;
  lastChangeAt?: string;
  lastError?: string;
}

interface SyncInfo {
  status: Record<string, ListSyncStatus>;
  reconcileIntervalMs: number;
  lists: string[];
  activeSyncHost?: string;
  thisHost: string;
}

function formatTimestamp(value: string | undefined): string {
  return value ? new Date(value).toLocaleString("nl-NL") : "—";
}

export function SyncStatusModal({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<SyncInfo | null>(null);
  const [intervalInput, setIntervalInput] = useState("");
  const [hostInput, setHostInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [forcing, setForcing] = useState(false);

  async function fetchInfo() {
    const res = await fetch("/api/sync");
    const json = (await res.json()) as SyncInfo;
    setInfo(json);
    setIntervalInput(String(Math.round(json.reconcileIntervalMs / 1000)));
    setHostInput(json.activeSyncHost ?? "");
  }

  async function saveHost() {
    const res = await fetch("/api/sync", {
      method: "POST",
      body: JSON.stringify({ activeSyncHost: hostInput }),
    });
    const json = await res.json();
    setMessage(res.ok ? "Opgeslagen — geldt vanaf de volgende cyclus." : json.error);
    fetchInfo();
  }

  async function saveInterval() {
    const seconds = Number(intervalInput);
    const res = await fetch("/api/sync", {
      method: "POST",
      body: JSON.stringify({ reconcileIntervalMs: seconds * 1000 }),
    });
    const json = await res.json();
    setMessage(res.ok ? "Opgeslagen — gaat in bij de volgende cyclus." : json.error);
    fetchInfo();
  }

  async function forceSync() {
    setForcing(true);
    setMessage("Volledige sync loopt...");
    try {
      await fetch("/api/sync/force", { method: "POST" });
      setMessage("Volledige sync klaar.");
    } catch {
      setMessage("Volledige sync mislukt.");
    } finally {
      setForcing(false);
      fetchInfo();
    }
  }

  useEffect(() => {
    fetchInfo();
    const interval = setInterval(fetchInfo, 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{ background: "white", borderRadius: 8, padding: "1.5rem", maxWidth: 900, width: "90%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Microsoft Todo-sync</h2>
          <button type="button" onClick={onClose}>
            Sluiten
          </button>
        </div>

        {!info ? (
          <p className="meta">Laden...</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", margin: "1rem 0" }}>
              <label htmlFor="host">Aangewezen sync-host</label>
              <input
                id="host"
                value={hostInput}
                onChange={(e) => setHostInput(e.target.value)}
                placeholder="(leeg = elk apparaat mag syncen)"
                style={{ width: "16rem" }}
              />
              <button type="button" onClick={saveHost}>
                Opslaan
              </button>
              <span className="meta">
                dit apparaat: {info.thisHost}
                {info.activeSyncHost && info.activeSyncHost !== info.thisHost ? " (niet de aangewezen host)" : ""}
              </span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", margin: "1rem 0" }}>
              <label htmlFor="interval">Volledige reconciliatie elke</label>
              <input
                id="interval"
                type="number"
                min={10}
                value={intervalInput}
                onChange={(e) => setIntervalInput(e.target.value)}
                style={{ width: "5rem" }}
              />
              <span>seconden</span>
              <button type="button" onClick={saveInterval}>
                Opslaan
              </button>
              <button type="button" onClick={forceSync} disabled={forcing}>
                {forcing ? "Sync loopt..." : "Volledige sync forceren"}
              </button>
              {message && <span className="meta">{message}</span>}
            </div>

            <div style={{ margin: "1rem 0" }}>
              <LoginPanel />
            </div>

            <table>
              <thead>
                <tr>
                  <th>Lijst</th>
                  <th>Laatste push</th>
                  <th>Laatste pull</th>
                  <th>Laatste reconciliatie</th>
                  <th>Laatste wijziging</th>
                  <th>Fout</th>
                </tr>
              </thead>
              <tbody>
                {info.lists.map((list) => {
                  const s = info.status[list] ?? {};
                  return (
                    <tr key={list}>
                      <td>{list}</td>
                      <td>{formatTimestamp(s.lastPushAt)}</td>
                      <td>{formatTimestamp(s.lastPullAt)}</td>
                      <td>{formatTimestamp(s.lastReconcileAt)}</td>
                      <td>{formatTimestamp(s.lastChangeAt)}</td>
                      <td style={{ color: s.lastError ? "crimson" : undefined }}>{s.lastError ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
