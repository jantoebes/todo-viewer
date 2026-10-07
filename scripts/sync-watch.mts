import fs from "fs";
import { DATA_DIR, STATE_DIR as META_DIR } from "../src/lib/paths.ts";
import { loadSyncConfig, isActiveSyncHost, DEFAULT_RECONCILE_INTERVAL_MS } from "../src/lib/syncConfig.ts";
import { updateSyncStatus, SYNC_TRIGGER_FILE } from "../src/lib/syncStatus.ts";
import { LIST_EXTENSION } from "../src/lib/dataStore.ts";
import { acquireTokenSilentOrFail, msalClient } from "./msftAuth.mts";
import { pushList } from "./syncPush.mts";
import { pullList, fullReconcileList } from "./syncPull.mts";

const PUSH_DEBOUNCE_MS = 300;
const PULL_INTERVAL_MS = 45_000;

async function getAccessToken(): Promise<string> {
  return (await acquireTokenSilentOrFail(msalClient())).accessToken;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Push moet altijd vóór pull lopen binnen één cyclus (zie syncPull.mts), en cycli voor
// dezelfde lijst mogen nooit overlappen (anders lezen/schrijven push en pull het
// state-bestand tegelijk). Verschillende lijsten hebben elk hun eigen state-bestand en
// mogen dus wel gelijktijdig draaien.
function createLock() {
  let tail: Promise<unknown> = Promise.resolve();
  return function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = tail.then(fn, fn);
    tail = next.catch(() => undefined);
    return next;
  };
}

type WithLock = ReturnType<typeof createLock>;

function createReconciler(listName: string, withLock: WithLock) {
  let running = false;
  let rerunRequested = false;

  async function runOnce(): Promise<void> {
    const config = loadSyncConfig();
    if (!isActiveSyncHost(config)) {
      console.log(`[sync-watch] geen actieve sync-host (${config.activeSyncHost}) — sync overgeslagen voor ${listName}`);
    } else {
      const accessToken = await getAccessToken();
      await pushList(accessToken, listName, config);
      updateSyncStatus(listName, { lastPushAt: new Date().toISOString(), lastError: undefined });

      const freshConfig = loadSyncConfig();
      const changed = await pullList(accessToken, listName, freshConfig);
      updateSyncStatus(listName, { lastPullAt: new Date().toISOString(), lastError: undefined });
      if (changed) {
        updateSyncStatus(listName, { lastChangeAt: new Date().toISOString() });
        console.log(`[sync-watch] Microsoft Todo-wijzigingen toegepast op ${listName}${LIST_EXTENSION}`);
      }
    }
  }

  async function pushThenFullReconcile(): Promise<void> {
    await withLock(async () => {
      await runOnce().catch((err) => {
        console.error(`[sync-watch] fout tijdens sync van ${listName}:`, errorMessage(err));
        updateSyncStatus(listName, { lastError: errorMessage(err) });
      });
      await runFullReconcile(listName);
    });
  }

  async function reconcile(): Promise<void> {
    if (running) {
      rerunRequested = true;
      return;
    }
    running = true;
    try {
      await withLock(runOnce);
      while (rerunRequested) {
        rerunRequested = false;
        await withLock(runOnce);
      }
    } catch (err) {
      console.error(`[sync-watch] fout tijdens sync van ${listName}:`, errorMessage(err));
      updateSyncStatus(listName, { lastError: errorMessage(err) });
    } finally {
      running = false;
    }
  }

  return { reconcile, pushThenFullReconcile };
}

async function runFullReconcile(listName: string): Promise<void> {
  try {
    const config = loadSyncConfig();
    if (!isActiveSyncHost(config)) {
      console.log(`[sync-watch] geen actieve sync-host (${config.activeSyncHost}) — reconciliatie overgeslagen voor ${listName}`);
    } else {
      const accessToken = await getAccessToken();
      const changed = await fullReconcileList(accessToken, listName, config);
      updateSyncStatus(listName, { lastReconcileAt: new Date().toISOString(), lastError: undefined });
      if (changed) {
        updateSyncStatus(listName, { lastChangeAt: new Date().toISOString() });
        console.log(`[sync-watch] volledige reconciliatie vond wijzigingen voor ${listName}${LIST_EXTENSION}`);
      }
    }
  } catch (err) {
    console.error(`[sync-watch] fout tijdens reconciliatie van ${listName}:`, errorMessage(err));
    updateSyncStatus(listName, { lastError: errorMessage(err) });
  }
}

// Zelf-herplannende timer i.p.v. setInterval, zodat een wijziging aan reconcileIntervalMs
// in config.yaml (bv. via de UI) bij de volgende cyclus meteen ingaat, zonder herstart.
function scheduleFullReconcile(pushThenFullReconcile: () => Promise<void>): void {
  const intervalMs = loadSyncConfig().reconcileIntervalMs ?? DEFAULT_RECONCILE_INTERVAL_MS;
  setTimeout(async () => {
    await pushThenFullReconcile();
    scheduleFullReconcile(pushThenFullReconcile);
  }, intervalMs);
}

function watchTrigger(pushThenFullReconcile: () => Promise<void>): void {
  let triggerTimer: ReturnType<typeof setTimeout> | undefined;
  fs.watch(META_DIR, (_event, filename) => {
    if (filename !== SYNC_TRIGGER_FILE) return;
    if (triggerTimer) clearTimeout(triggerTimer);
    triggerTimer = setTimeout(() => {
      console.log("[sync-watch] volledige sync aangevraagd via viewer");
      pushThenFullReconcile();
    }, PUSH_DEBOUNCE_MS);
  });
}

function watchList(listName: string): void {
  const withLock = createLock();
  const { reconcile, pushThenFullReconcile } = createReconciler(listName, withLock);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  fs.watch(DATA_DIR, (_event, filename) => {
    if (filename !== `${listName}${LIST_EXTENSION}`) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(reconcile, PUSH_DEBOUNCE_MS);
  });

  setInterval(reconcile, PULL_INTERVAL_MS);
  scheduleFullReconcile(pushThenFullReconcile);
  watchTrigger(pushThenFullReconcile);
  pushThenFullReconcile()
    .then(() => console.log(`[sync-watch] eerste sync klaar, watching ${listName}${LIST_EXTENSION}`));
}

async function main(): Promise<void> {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(META_DIR, { recursive: true });
  const config = loadSyncConfig();
  const requested = process.argv.slice(2);
  const listNames = requested.length > 0 ? requested : Object.keys(config.lists);

  if (listNames.length > 0) {
    listNames.forEach(watchList);
  } else {
    console.log(`[sync-watch] geen lijsten in ${META_DIR}/config.yaml — wacht tot die verschijnt`);
    waitForConfig();
  }
}

function waitForConfig(): void {
  fs.watch(META_DIR, (_event, filename) => {
    if (filename === "config.yaml") process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
