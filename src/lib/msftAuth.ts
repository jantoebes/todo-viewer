import fs from "fs";
import path from "path";
import {
  PublicClientApplication,
  type AuthenticationResult,
  type ICachePlugin,
} from "@azure/msal-node";
import { STATE_DIR } from "./paths.ts";

type DeviceCodeRequest = Parameters<PublicClientApplication["acquireTokenByDeviceCode"]>[0];
export type DeviceCodeResponse = Parameters<DeviceCodeRequest["deviceCodeCallback"]>[0];

const CACHE_PATH = path.join(STATE_DIR, "msft-cache.json");
const SCOPES = ["Tasks.ReadWrite"];

export const LOGIN_EXPIRED_MESSAGE = "Microsoft-login verlopen — log opnieuw in via de viewer";

function readCacheFile(): string {
  return fs.existsSync(CACHE_PATH) ? fs.readFileSync(CACHE_PATH, "utf8") : "";
}

function writeCacheFile(content: string): void {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, content, "utf8");
}

const cachePlugin: ICachePlugin = {
  beforeCacheAccess: async (context) => {
    context.tokenCache.deserialize(readCacheFile());
  },
  afterCacheAccess: async (context) => {
    if (context.cacheHasChanged) writeCacheFile(context.tokenCache.serialize());
  },
};

export function loadEnvLocal(): void {
  const envFile = path.resolve(".env.local");
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
}

export function requireClientId(): string {
  return process.env.MSFT_CLIENT_ID ?? (() => { throw new Error("MSFT_CLIENT_ID ontbreekt (env of .env.local)"); })();
}

export function createClient(clientId: string): PublicClientApplication {
  return new PublicClientApplication({
    auth: { clientId, authority: "https://login.microsoftonline.com/consumers" },
    cache: { cachePlugin },
  });
}

export function msalClient(): PublicClientApplication {
  loadEnvLocal();
  return createClient(requireClientId());
}

async function acquireTokenSilentOrUndefined(
  pca: PublicClientApplication
): Promise<AuthenticationResult | undefined> {
  const accounts = await pca.getTokenCache().getAllAccounts();
  return accounts[0]
    ? pca.acquireTokenSilent({ account: accounts[0], scopes: SCOPES }).catch(() => undefined)
    : undefined;
}

export async function acquireTokenByDeviceCode(
  pca: PublicClientApplication,
  onDeviceCode: (response: DeviceCodeResponse) => void = (response) => console.log(response.message)
): Promise<AuthenticationResult | null> {
  return pca.acquireTokenByDeviceCode({ scopes: SCOPES, deviceCodeCallback: onDeviceCode });
}

export async function acquireToken(pca: PublicClientApplication): Promise<AuthenticationResult> {
  const silent = await acquireTokenSilentOrUndefined(pca);
  const result = silent ?? (await acquireTokenByDeviceCode(pca));
  return result ?? (() => { throw new Error("Kon geen token verkrijgen"); })();
}

export async function acquireTokenSilentOrFail(pca: PublicClientApplication): Promise<AuthenticationResult> {
  const silent = await acquireTokenSilentOrUndefined(pca);
  return silent ?? (() => { throw new Error(LOGIN_EXPIRED_MESSAGE); })();
}
