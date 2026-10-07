import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { loadEnvLocal } from "../src/lib/msftAuth.ts";
import { DATA_DIR, STATE_DIR } from "../src/lib/paths.ts";

interface Proc {
  name: string;
  args: string[];
}

const PORT = process.env.PORT ?? "4243";
const HOST = process.env.HOST ?? "127.0.0.1";
const NEXT_BIN = path.resolve("node_modules/next/dist/bin/next");

function isSyncEnabled(): boolean {
  loadEnvLocal();
  return Boolean(process.env.MSFT_CLIENT_ID);
}

function processes(): Proc[] {
  const base: Proc[] = [
    { name: "next", args: [NEXT_BIN, "start", "-p", PORT, "-H", HOST] },
    { name: "format", args: ["scripts/watch-board.mts"] },
    { name: "history", args: ["scripts/history-commit.mts"] },
    { name: "dsstore", args: ["scripts/ds-store-cleanup.mts"] },
  ];
  const sync: Proc[] = [{ name: "sync", args: ["scripts/run-forever.mts", "scripts/sync-watch.mts"] }];
  return isSyncEnabled() ? [...base, ...sync] : base;
}

function prefixed(name: string, write: (line: string) => void): (chunk: Buffer) => void {
  return (chunk) =>
    chunk
      .toString()
      .split("\n")
      .filter(Boolean)
      .forEach((line) => write(`${new Date().toISOString()} [${name}] ${line}\n`));
}

function spawnProc(proc: Proc, onExit: (name: string, code: number | null) => void): ChildProcess {
  const child = spawn(process.execPath, proc.args, { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", prefixed(proc.name, (line) => process.stdout.write(line)));
  child.stderr.on("data", prefixed(proc.name, (line) => process.stderr.write(line)));
  child.on("exit", (code) => onExit(proc.name, code));
  return child;
}

function main(): void {
  const children: ChildProcess[] = [];
  const stopAll = (code: number) => {
    children.forEach((child) => child.kill());
    process.exit(code);
  };
  const onExit = (name: string, code: number | null) => {
    console.error(`[start] ${name} gestopt (code ${code}) — alles stoppen`);
    stopAll(1);
  };
  const procs = processes();
  console.log(`[start] data: ${DATA_DIR}, state: ${STATE_DIR}, processen: ${procs.map((p) => p.name).join(", ")}`);
  procs.forEach((proc) => children.push(spawnProc(proc, onExit)));
  process.on("SIGTERM", () => stopAll(0));
  process.on("SIGINT", () => stopAll(0));
}

main();
