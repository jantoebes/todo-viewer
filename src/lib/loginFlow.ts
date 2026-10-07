import { forceFullSync } from "./forceSync";
import { acquireTokenByDeviceCode, msalClient, type DeviceCodeResponse } from "./msftAuth";
import { updateSyncStatus } from "./syncStatus";
import { loadSyncConfig } from "./syncConfig";

export type LoginState =
  | { state: "idle" }
  | { state: "pending"; userCode: string; verificationUri: string; expiresAt: string }
  | { state: "syncing" }
  | { state: "success"; at: string }
  | { state: "failed"; message: string };

const store = globalThis as typeof globalThis & { __msftLoginState?: LoginState };

export function getLoginState(): LoginState {
  return store.__msftLoginState ?? { state: "idle" };
}

function setLoginState(state: LoginState): LoginState {
  store.__msftLoginState = state;
  return state;
}

function pendingFrom(response: DeviceCodeResponse): LoginState {
  return setLoginState({
    state: "pending",
    userCode: response.userCode,
    verificationUri: response.verificationUri,
    expiresAt: new Date(Date.now() + response.expiresIn * 1000).toISOString(),
  });
}

function clearSyncErrors(): void {
  Object.keys(loadSyncConfig().lists).forEach((list) => updateSyncStatus(list, { lastError: undefined }));
}

async function finishLogin(): Promise<void> {
  setLoginState({ state: "syncing" });
  clearSyncErrors();
  await forceFullSync();
  setLoginState({ state: "success", at: new Date().toISOString() });
}

function failLogin(err: unknown): void {
  setLoginState({ state: "failed", message: err instanceof Error ? err.message : String(err) });
}

export function startLogin(): Promise<LoginState> {
  const current = getLoginState();
  return current.state === "pending" || current.state === "syncing"
    ? Promise.resolve(current)
    : new Promise((resolve) => {
        acquireTokenByDeviceCode(msalClient(), (response) => resolve(pendingFrom(response)))
          .then((result) => (result ? finishLogin() : failLogin(new Error("Geen token ontvangen"))))
          .catch((err) => {
            failLogin(err);
            resolve(getLoginState());
          });
      });
}
