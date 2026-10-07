import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";

const RESTART_DELAY_MS = 5000;
const CHANGE_DEBOUNCE_MS = 300;
const WATCH_DIRS = ["scripts", "src/lib"].map((dir) => path.join(process.cwd(), dir));

const [script, ...args] = process.argv.slice(2);
const state: { child?: ChildProcess; restartTimer?: ReturnType<typeof setTimeout>; changeTimer?: ReturnType<typeof setTimeout> } = {};

function log(message: string): void {
  console.log(`[run-forever] ${message}`);
}

function scheduleRestart(delayMs: number): void {
  clearTimeout(state.restartTimer);
  state.restartTimer = setTimeout(start, delayMs);
}

function onExit(child: ChildProcess, code: number | null, signal: NodeJS.Signals | null): void {
  if (state.child === child) {
    log(`${script} gestopt (code ${code}, signaal ${signal}) — herstart over ${RESTART_DELAY_MS / 1000}s`);
    state.child = undefined;
    scheduleRestart(RESTART_DELAY_MS);
  }
}

function start(): void {
  log(`start ${script}`);
  const child = spawn(process.execPath, [script, ...args], { stdio: "inherit" });
  child.on("exit", (code, signal) => onExit(child, code, signal));
  state.child = child;
}

function restartForCodeChange(): void {
  const child = state.child;
  log("codewijziging — herstart");
  state.child = undefined;
  child?.kill();
  scheduleRestart(0);
}

function onFileChange(_event: string, filename: string | null): void {
  if (filename && /\.(m?ts)$/.test(filename)) {
    clearTimeout(state.changeTimer);
    state.changeTimer = setTimeout(restartForCodeChange, CHANGE_DEBOUNCE_MS);
  }
}

function stopAll(): void {
  state.child?.kill();
  process.exit(0);
}

WATCH_DIRS.forEach((dir) => fs.watch(dir, { recursive: true }, onFileChange));
process.on("SIGTERM", stopAll);
process.on("SIGINT", stopAll);
start();
