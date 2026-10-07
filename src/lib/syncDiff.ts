import type { SyncedItem } from "./syncState";

export interface CurrentItem {
  title: string;
  status: string;
}

export interface ResolvedItem {
  title: string;
  status: string;
  msftId?: string;
  changed: boolean;
}

export interface DiffResult {
  resolved: ResolvedItem[];
  deletes: SyncedItem[];
}

function matchByTitle(prev: SyncedItem[], curr: CurrentItem[]): (SyncedItem | undefined)[] {
  const prevUsed = new Array(prev.length).fill(false);
  return curr.map((c) => {
    const pi = prev.findIndex((p, idx) => !prevUsed[idx] && p.title === c.title);
    if (pi === -1) return undefined;
    prevUsed[pi] = true;
    return prev[pi];
  });
}

function matchLeftoversByPosition(
  prev: SyncedItem[],
  currMatch: (SyncedItem | undefined)[]
): (SyncedItem | undefined)[] {
  const matchedPrev = new Set(currMatch.filter((m): m is SyncedItem => m !== undefined));
  const leftoverPrev = prev.filter((p) => !matchedPrev.has(p));
  const leftoverCurrIndexes = currMatch.map((m, i) => (m ? -1 : i)).filter((i) => i !== -1);

  const result = [...currMatch];
  const pairCount = Math.min(leftoverPrev.length, leftoverCurrIndexes.length);
  for (let k = 0; k < pairCount; k++) result[leftoverCurrIndexes[k]] = leftoverPrev[k];
  return result;
}

export function diffGroup(prev: SyncedItem[], curr: CurrentItem[]): DiffResult {
  const titleMatch = matchByTitle(prev, curr);
  const fullMatch = matchLeftoversByPosition(prev, titleMatch);

  const resolved: ResolvedItem[] = curr.map((c, i) => {
    const match = fullMatch[i];
    const changed = !match || match.title !== c.title || match.status !== c.status;
    return { title: c.title, status: c.status, msftId: match?.msftId, changed };
  });

  const matchedPrev = new Set(fullMatch.filter((m): m is SyncedItem => m !== undefined));
  const deletes = prev.filter((p) => !matchedPrev.has(p));

  return { resolved, deletes };
}
