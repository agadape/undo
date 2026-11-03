// Local runner for the Coba Curi guard: one tick every GUARD_INTERVAL_SEC (default 30 s).
// Writes a heartbeat + action log to ../.data/guard/ for the dashboard.
//   node guard/run-local.mjs            (from undo/app; reads the repository root .env)
//   node guard/run-local.mjs --once
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { FailoverRpcProvider, JsonRpcProvider } from "near-api-js";
import { tick, telegram } from "./guard.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "..", "..", "..", ".env"), quiet: true });
const dataDir = path.resolve(here, "..", ".data", "guard");
fs.mkdirSync(dataDir, { recursive: true });

const env = process.env;
for (const k of ["COBACURI_CONTRACT_ID", "COBACURI_DEMO_ID", "COBACURI_GUARD_ID", "COBACURI_GUARD_FC_KEY"]) {
  if (!env[k]) {
    console.error(`${k} missing in .env (run spikes/cc_deploy.mjs first)`);
    process.exit(1);
  }
}
const provider = new FailoverRpcProvider(
  // rpc.testnet.near.org is deprecated, so it is only the last fallback.
  ["https://test.rpc.fastnear.com", "https://rpc.testnet.fastnear.com", "https://rpc.testnet.near.org"].map((url) => new JsonRpcProvider({ url })),
);
const cfg = {
  provider,
  contractId: env.COBACURI_CONTRACT_ID,
  demoId: env.COBACURI_DEMO_ID,
  guardId: env.COBACURI_GUARD_ID,
  fcKey: env.COBACURI_GUARD_FC_KEY,
  demoKey: env.COBACURI_DEMO_PRIVATE_KEY,
  guardKey: env.COBACURI_GUARD_PRIVATE_KEY,
  notify: telegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID),
};
const interval = Number(env.GUARD_INTERVAL_SEC ?? 30) * 1000;

async function once() {
  try {
    const r = await tick(cfg);
    fs.writeFileSync(path.join(dataDir, "heartbeat.json"), JSON.stringify({ at: r.at, runner: "local", ok: true }));
    if (r.done.length) {
      fs.appendFileSync(path.join(dataDir, "actions.jsonl"), r.done.map((d) => JSON.stringify({ at: r.at, ...d })).join("\n") + "\n");
      console.log(r.at, JSON.stringify(r.done));
    }
  } catch (e) {
    fs.writeFileSync(path.join(dataDir, "heartbeat.json"), JSON.stringify({ at: new Date().toISOString(), runner: "local", ok: false, error: String(e.message).slice(0, 200) }));
    console.error(new Date().toISOString(), "tick failed:", e.message);
  }
}

await once();
if (!process.argv.includes("--once")) {
  console.log(`guard running every ${interval / 1000}s for ${cfg.demoId} on ${cfg.contractId}`);
  setInterval(once, interval);
}
