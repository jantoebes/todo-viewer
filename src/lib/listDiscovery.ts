export interface RemoteList {
  id: string;
  displayName: string;
  wellknownListName?: string;
}

export interface DiscoveryResult {
  groups: Record<string, string>;
  added: string[];
  renamed: [string, string][];
  removed: string[];
  protectedListIds: string[];
}

function groupNameFor(displayName: string, prefix: string | undefined): string {
  const fullPrefix = prefix ? `${prefix} · ` : "";
  return fullPrefix && displayName.startsWith(fullPrefix) ? displayName.slice(fullPrefix.length) : displayName;
}

function uniqueName(name: string, taken: Set<string>, n = 2): string {
  const candidate = n === 2 && !taken.has(name) ? name : `${name} (${n})`;
  return taken.has(candidate) ? uniqueName(name, taken, n + 1) : candidate;
}

function isCandidate(list: RemoteList, excludeWellknown: string[], claimedElsewhere: Set<string>): boolean {
  return !excludeWellknown.includes(list.wellknownListName ?? "none") && !claimedElsewhere.has(list.id);
}

export function discoverGroups(
  remote: RemoteList[],
  groups: Record<string, string>,
  options: { excludeWellknown: string[]; claimedElsewhere: Set<string>; prefix?: string }
): DiscoveryResult {
  const candidates = remote.filter((list) => isCandidate(list, options.excludeWellknown, options.claimedElsewhere));
  const groupById = new Map(Object.entries(groups).map(([group, id]) => [id, group]));
  const candidateIds = new Set(candidates.map((list) => list.id));

  const removed = Object.entries(groups)
    .filter(([, id]) => !candidateIds.has(id))
    .map(([group]) => group);

  const known = candidates.filter((list) => groupById.has(list.id));
  const fresh = candidates.filter((list) => !groupById.has(list.id));

  const knownEntries = known.reduce<{ entries: [string, string][]; renamed: [string, string][]; taken: Set<string> }>(
    (acc, list) => {
      const current = groupById.get(list.id) ?? list.displayName;
      const wanted = groupNameFor(list.displayName, options.prefix);
      const others = new Set(known.filter((k) => k.id !== list.id).map((k) => groupById.get(k.id) ?? ""));
      const target = wanted === current || others.has(wanted) || acc.taken.has(wanted) ? current : wanted;
      return {
        entries: [...acc.entries, [target, list.id]],
        renamed: target === current ? acc.renamed : [...acc.renamed, [current, target]],
        taken: new Set([...acc.taken, target]),
      };
    },
    { entries: [], renamed: [], taken: new Set() }
  );

  const freshEntries = fresh.reduce<{ entries: [string, string][]; taken: Set<string> }>(
    (acc, list) => {
      const name = uniqueName(groupNameFor(list.displayName, options.prefix), acc.taken);
      return { entries: [...acc.entries, [name, list.id]], taken: new Set([...acc.taken, name]) };
    },
    { entries: [], taken: knownEntries.taken }
  );

  return {
    groups: Object.fromEntries([...knownEntries.entries, ...freshEntries.entries]),
    added: freshEntries.entries.map(([group]) => group),
    renamed: knownEntries.renamed,
    removed,
    protectedListIds: candidates.filter((list) => (list.wellknownListName ?? "none") !== "none").map((list) => list.id),
  };
}
