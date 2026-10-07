import { acquireToken, createClient, loadEnvLocal, requireClientId } from "./msftAuth.mts";

function decodeJwtPayload(token: string): unknown {
  const payload = token.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

async function main(): Promise<void> {
  loadEnvLocal();
  const pca = createClient(requireClientId());
  const token = await acquireToken(pca);
  console.log("account:", token.account?.username);
  console.log("scopes:", token.scopes);
  console.log("payload:", JSON.stringify(decodeJwtPayload(token.accessToken), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
