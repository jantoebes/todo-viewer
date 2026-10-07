"use client";

import { useEffect, useState } from "react";

type LoginState =
  | { state: "idle" }
  | { state: "pending"; userCode: string; verificationUri: string; expiresAt: string }
  | { state: "syncing" }
  | { state: "success"; at: string }
  | { state: "failed"; message: string };

const POLL_MS = 3000;

async function fetchLoginState(init?: RequestInit): Promise<LoginState> {
  const res = await fetch("/api/sync/login", init);
  return res.json();
}

function isBusy(login: LoginState): boolean {
  return login.state === "pending" || login.state === "syncing";
}

function LoginStatus({ login }: { login: LoginState }) {
  return login.state === "pending" ? (
    <span>
      Ga naar{" "}
      <a href={login.verificationUri} target="_blank" rel="noreferrer">
        {login.verificationUri}
      </a>{" "}
      en voer code <code style={{ fontWeight: "bold", userSelect: "all" }}>{login.userCode}</code> in (geldig tot{" "}
      {new Date(login.expiresAt).toLocaleTimeString("nl-NL")})
    </span>
  ) : login.state === "syncing" ? (
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

  const start = () => fetchLoginState({ method: "POST" }).then(setLogin);

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.85rem" }}>
      <button type="button" onClick={start} disabled={isBusy(login)}>
        Opnieuw inloggen bij Microsoft
      </button>
      <LoginStatus login={login} />
    </div>
  );
}
