// Cloudflare Worker wrapper for the Coba Curi guard: one idempotent tick every minute (cron).
// Secrets: COBACURI_GUARD_FC_KEY, COBACURI_GUARD_PRIVATE_KEY, COBACURI_DEMO_PRIVATE_KEY (wrangler secret bulk).
// GET / returns the last heartbeat {at, ok, actions, error?} as JSON (CORS open) for the /coba-curi page.
import { FailoverRpcProvider, JsonRpcProvider } from "near-api-js";
import { tick, telegram } from "./guard.mjs";

const RPCS = ["https://rpc.testnet.fastnear.com", "https://test.rpc.fastnear.com", "https://near-testnet.drpc.org"];
const HB_KEY = "heartbeat";

async function run(env) {
  const provider = new FailoverRpcProvider(RPCS.map((url) => new JsonRpcProvider({ url }, { retries: 1, wait: 300, backoff: 2 })));
  try {
    const r = await tick({
      provider,
      contractId: env.COBACURI_CONTRACT_ID,
      demoId: env.COBACURI_DEMO_ID,
      guardId: env.COBACURI_GUARD_ID,
      fcKey: env.COBACURI_GUARD_FC_KEY,
      demoKey: env.COBACURI_DEMO_PRIVATE_KEY,
      guardKey: env.COBACURI_GUARD_PRIVATE_KEY,
      notify: telegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID),
    });
    console.log(JSON.stringify(r));
    return { at: r.at, ok: true, actions: r.done.length };
  } catch (e) {
    console.error("tick failed:", e?.stack ?? String(e));
    return { at: new Date().toISOString(), ok: false, error: String(e?.message ?? e).slice(0, 200) };
  }
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      run(env).then(async (hb) => {
        // Every 2nd minute, or at once when something happened or failed (KV free tier: 1,000 writes a day).
        if (env.GUARD_HB && (new Date().getUTCMinutes() % 2 === 0 || !hb.ok || hb.actions > 0)) {
          await env.GUARD_HB.put(HB_KEY, JSON.stringify({ ...hb, runner: "cloudflare", everySec: 60 }));
        }
      }),
    );
  },
  async fetch(_req, env) {
    const hb = env.GUARD_HB ? await env.GUARD_HB.get(HB_KEY) : null;
    return new Response(hb ?? "null", {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
    });
  },
};
