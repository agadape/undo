// S3a — create a throwaway testnet account via the faucet helper service.
// Private key goes to ../.env only; never printed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KeyPair, JsonRpcProvider } from "near-api-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
if (/^NEAR_ACCOUNT_ID=.+$/m.test(env)) {
  console.log("Account already in .env:", env.match(/^NEAR_ACCOUNT_ID=(.+)$/m)[1]);
  process.exit(0);
}

const kp = KeyPair.fromRandom("ed25519");
const publicKey = kp.getPublicKey().toString();
const accountId = `nh-spike-${Date.now().toString(36)}.testnet`;
console.log("accountId:", accountId);
console.log("publicKey:", publicKey);

const helpers = [
  "https://helper.nearprotocol.com/account",
  "https://helper.testnet.near.org/account",
];
let created = false;
for (const url of helpers) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: publicKey }),
    });
    const text = await res.text();
    console.log(`${url} -> HTTP ${res.status} in ${Date.now() - t0}ms; body: ${text.slice(0, 300)}`);
    if (res.ok) { created = true; break; }
  } catch (e) {
    console.log(`${url} -> error ${e.message}`);
  }
}
if (!created) process.exit(1);

// Save key before anything else can fail.
const lines = [
  `NEAR_ACCOUNT_ID=${accountId}`,
  `NEAR_PRIVATE_KEY=${kp.toString()}`,
];
fs.writeFileSync(envPath, (env ? env.trimEnd() + "\n" : "") + lines.join("\n") + "\n");
console.log("Saved credentials to .env (gitignored).");

const provider = new JsonRpcProvider({ url: "https://rpc.testnet.fastnear.com" });
for (let i = 0; i < 10; i++) {
  try {
    const view = await provider.viewAccount({ accountId });
    console.log("view_account:", JSON.stringify(view));
    break;
  } catch (e) {
    await new Promise((r) => setTimeout(r, 2000));
    if (i === 9) console.log("view_account still failing:", e.message);
  }
}
