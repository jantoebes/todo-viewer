import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { DATA_DIR, STATE_DIR } from "../src/lib/paths.ts";

const HISTORY_DIR = process.env.TODO_HISTORY_DIR ?? path.join(os.homedir(), "todo-history");
const DEBOUNCE_MS = 5000;
const SOURCES = [
  { dir: DATA_DIR, name: "data", matches: (f: string) => f.endsWith(".todo") },
  { dir: STATE_DIR, name: "state", matches: (f: string) => f === "config.yaml" || f.endsWith("-state.json") },
];

function git(...args: string[]): string {
  return execFileSync("git", ["-C", HISTORY_DIR, ...args], { encoding: "utf8" });
}

function ensureRepo(): void {
  SOURCES.forEach((source) => fs.mkdirSync(source.dir, { recursive: true }));
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  if (!fs.existsSync(path.join(HISTORY_DIR, ".git"))) git("init", "-q");
}

function copySource(source: (typeof SOURCES)[number]): void {
  const target = path.join(HISTORY_DIR, source.name);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  fs.readdirSync(source.dir)
    .filter(source.matches)
    .forEach((f) => fs.copyFileSync(path.join(source.dir, f), path.join(target, f)));
}

function changedFiles(): string[] {
  return git("status", "--porcelain", "-uall").split("\n").filter(Boolean).map((line) => line.slice(3));
}

function snapshot(): void {
  try {
    SOURCES.forEach(copySource);
    const changed = changedFiles();
    if (changed.length > 0) {
      git("add", "-A");
      git("-c", "user.name=todo-viewer", "-c", "user.email=todo-viewer@localhost", "commit", "-q", "-m", `${new Date().toISOString()} ${changed.join(", ")}`);
      console.log(`[history] commit: ${changed.join(", ")}`);
    }
  } catch (err) {
    console.error(`[history] snapshot mislukt: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function watchSources(onChange: () => void): void {
  SOURCES.forEach((source) =>
    fs.watch(source.dir, (_event, filename) => {
      if (filename && source.matches(filename)) onChange();
    })
  );
}

function debounced(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

ensureRepo();
snapshot();
watchSources(debounced(snapshot, DEBOUNCE_MS));
console.log(`[history] snapshots van ${DATA_DIR} en ${STATE_DIR} naar ${HISTORY_DIR}`);
