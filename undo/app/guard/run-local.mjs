// Runner for the Coba Curi guard: one tick every GUARD_INTERVAL_SEC (default 30 s), or one tick with --once.
// Writes a heartbeat + action log to ../.data/guard/ for the local dashboard.
//   node guard/run-local.mjs            (from undo/app; reads the repository root .env)
//   node guard/run-local.mjs --once     (GitHub Actions: retries once, exits 1 if the tick still fails)
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
    console.error(`${k} missing (in .env locally, or as a GitHub secret)`);
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
const runner = env.GUARD_RUNNER ?? "local";
const interval = Number(env.GUARD_INTERVAL_SEC ?? 30) * 1000;

async function once() {
  try {
    const r = await tick(cfg);
    fs.writeFileSync(path.join(dataDir, "heartbeat.json"), JSON.stringify({ at: r.at, runner, ok: true }));
    if (r.done.length) {
      fs.appendFileSync(path.join(dataDir, "actions.jsonl"), r.done.map((d) => JSON.stringify({ at: r.at, ...d })).join("\n") + "\n");
    }
    console.log(r.at, r.done.length ? JSON.stringify(r.done) : "ok, nothing to do");
    return true;
  } catch (e) {
    fs.writeFileSync(path.join(dataDir, "heartbeat.json"), JSON.stringify({ at: new Date().toISOString(), runner, ok: false, error: String(e.message).slice(0, 200) }));
    console.error(new Date().toISOString(), "tick failed:", e.message);
    return false;
  }
}

if (process.argv.includes("--once")) {
  // A short RPC or DNS hiccup should not fail the run: retry once after 20 s.
  const ok = (await once()) || (await new Promise((r) => setTimeout(r, 20_000)), await once());
  process.exit(ok ? 0 : 1);
}
await once();
console.log(`guard running every ${interval / 1000}s for ${cfg.demoId} on ${cfg.contractId}`);
setInterval(once, interval);
