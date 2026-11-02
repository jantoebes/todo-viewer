import { randomUUID } from "crypto";
import { forceFullSync } from "./forceSync";
import { acquireTokenByCode, createAuthCodeUrl, msalClient } from "./msftAuth";
import { updateSyncStatus } from "./syncStatus";
import { loadSyncConfig } from "./syncConfig";

export type LoginState =
  | { state: "idle" }
  | { state: "syncing" }
  | { state: "success"; at: string }
  | { state: "failed"; message: string };

type PendingAuth = { verifier: string; redirectUri: string };

const store = globalThis as typeof globalThis & {
  __msftLoginState?: LoginState;
  __msftPendingAuth?: Map<string, PendingAuth>;
};

const pendingAuths = (store.__msftPendingAuth ??= new Map<string, PendingAuth>());

export function getLoginState(): LoginState {
  return store.__msftLoginState ?? { state: "idle" };
}

function setLoginState(state: LoginState): LoginState {
  store.__msftLoginState = state;
  return state;
}

function clearSyncErrors(): void {
  Object.keys(loadSyncConfig().lists).forEach((list) => updateSyncStatus(list, { lastError: undefined }));
}

function loginHint(): string | undefined {
  return process.env.MSFT_LOGIN_HINT || undefined;
}

export async function startLogin(origin: string): Promise<{ url: string }> {
  const state = randomUUID();
  const redirectUri = `${origin}/api/sync/callback`;
  const { url, verifier } = await createAuthCodeUrl(msalClient(), redirectUri, state, loginHint());
  pendingAuths.set(state, { verifier, redirectUri });
  return { url };
}

async function syncAfterLogin(): Promise<LoginState> {
  setLoginState({ state: "syncing" });
  clearSyncErrors();
  await forceFullSync();
  return setLoginState({ state: "success", at: new Date().toISOString() });
}

function failLogin(err: unknown): LoginState {
  return setLoginState({ state: "failed", message: err instanceof Error ? err.message : String(err) });
}

async function exchangeCode(pending: PendingAuth, code: string): Promise<LoginState> {
  return acquireTokenByCode(msalClient(), { code, ...pending }, loginHint())
    .then(syncAfterLogin)
    .catch(failLogin);
}

export async function completeLogin(code: string | null, state: string | null, error: string | null): Promise<LoginState> {
  const pending = state ? pendingAuths.get(state) : undefined;
  state ? pendingAuths.delete(state) : undefined;
  return pending && code
    ? exchangeCode(pending, code)
    : failLogin(new Error(error ?? "Login verlopen of onbekend, probeer opnieuw"));
}
