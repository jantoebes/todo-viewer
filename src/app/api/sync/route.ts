import os from "os";
import { NextResponse } from "next/server";
import { DEFAULT_RECONCILE_INTERVAL_MS, loadSyncConfig, saveSyncConfig } from "@/lib/syncConfig";
import { loadSyncStatus } from "@/lib/syncStatus";

export async function GET() {
  const config = loadSyncConfig();
  return NextResponse.json({
    status: loadSyncStatus(),
    reconcileIntervalMs: config.reconcileIntervalMs ?? DEFAULT_RECONCILE_INTERVAL_MS,
    lists: Object.keys(config.lists),
    activeSyncHost: config.activeSyncHost,
    thisHost: os.hostname(),
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { reconcileIntervalMs?: number; activeSyncHost?: string };
  const config = loadSyncConfig();

  if (body.reconcileIntervalMs !== undefined) {
    if (!Number.isFinite(body.reconcileIntervalMs) || body.reconcileIntervalMs < 10_000) {
      return NextResponse.json({ error: "reconcileIntervalMs moet minstens 10000 (10s) zijn" }, { status: 400 });
    }
    config.reconcileIntervalMs = body.reconcileIntervalMs;
  }

  if (body.activeSyncHost !== undefined) {
    config.activeSyncHost = body.activeSyncHost || undefined;
  }

  saveSyncConfig(config);
  return NextResponse.json({ reconcileIntervalMs: config.reconcileIntervalMs, activeSyncHost: config.activeSyncHost });
}
