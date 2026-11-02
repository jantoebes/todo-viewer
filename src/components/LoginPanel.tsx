"use client";

import { useEffect, useState } from "react";

type LoginState =
  | { state: "idle" }
  | { state: "syncing" }
  | { state: "success"; at: string }
  | { state: "failed"; message: string };

const POLL_MS = 3000;

async function fetchLoginState(): Promise<LoginState> {
  const res = await fetch("/api/sync/login");
  return res.json();
}

async function redirectToMicrosoft(): Promise<void> {
  const res = await fetch("/api/sync/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin: window.location.origin }),
  });
  const { url } = await res.json();
  window.location.href = url;
}

function isBusy(login: LoginState): boolean {
  return login.state === "syncing";
}

function LoginStatus({ login }: { login: LoginState }) {
  return login.state === "syncing" ? (
    <span>Ingelogd — volledige sync loopt...</span>
  ) : login.state === "success" ? (
    <span>Ingelogd en gesynct om {new Date(login.at).toLocaleTimeString("nl-NL")}</span>
  ) : login.state === "failed" ? (
    <span style={{ color: "crimson" }}>Login mislukt: {login.message}</span>
  ) : null;
}

export function LoginPanel() {
  const [login, setLogin] = useState<LoginState>({ state: "idle" });

  useEffect(() => {
    fetchLoginState().then(setLogin);
  }, []);

  useEffect(() => {
    const interval = isBusy(login) ? setInterval(() => fetchLoginState().then(setLogin), POLL_MS) : undefined;
    return () => clearInterval(interval);
  }, [login.state]);

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.85rem" }}>
      <button type="button" onClick={redirectToMicrosoft} disabled={isBusy(login)}>
        Opnieuw inloggen bij Microsoft
      </button>
      <LoginStatus login={login} />
    </div>
  );
}
