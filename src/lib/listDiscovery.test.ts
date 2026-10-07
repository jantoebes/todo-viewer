import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverGroups } from "./listDiscovery.ts";

const options = { excludeWellknown: ["flaggedEmails"], claimedElsewhere: new Set<string>() };

test("adds new lists, renames known ones, removes missing ones", () => {
  const remote = [
    { id: "t", displayName: "Tasks", wellknownListName: "defaultList" },
    { id: "a", displayName: "Algemeen nieuw", wellknownListName: "none" },
    { id: "f", displayName: "Flagged Emails", wellknownListName: "flaggedEmails" },
  ];
  assert.deepEqual(discoverGroups(remote, { Algemeen: "a", weg: "x" }, options), {
    groups: { "Algemeen nieuw": "a", Tasks: "t" },
    added: ["Tasks"],
    renamed: [["Algemeen", "Algemeen nieuw"]],
    removed: ["weg"],
    protectedListIds: ["t"],
  });
});

test("dedupes names and skips lists claimed elsewhere", () => {
  const remote = [
    { id: "a", displayName: "A" },
    { id: "b", displayName: "A" },
    { id: "c", displayName: "C" },
  ];
  assert.deepEqual(discoverGroups(remote, { A: "a" }, { ...options, claimedElsewhere: new Set(["c"]) }), {
    groups: { A: "a", "A (2)": "b" },
    added: ["A (2)"],
    renamed: [],
    removed: [],
    protectedListIds: [],
  });
});

test("strips configured prefix", () => {
  const remote = [{ id: "a", displayName: "Werk · Mail" }];
  assert.deepEqual(discoverGroups(remote, {}, { ...options, prefix: "Werk" }).groups, { Mail: "a" });
});
