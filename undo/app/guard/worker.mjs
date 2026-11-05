// Cloudflare Worker wrapper for the Coba Curi guard: one idempotent tick every minute (cron).
// Secrets: COBACURI_GUARD_FC_KEY, COBACURI_GUARD_PRIVATE_KEY, COBACURI_DEMO_PRIVATE_KEY (wrangler secret bulk).
// GET / returns the last heartbeat {at, ok, actions, error?} as JSON (CORS open) for the /coba-curi page.
import { FailoverRpcProvider, JsonRpcProvider } from "near-api-js";
import { tick, telegram } from "./guard.mjs";

const RPCS = ["https://rpc.testnet.fastnear.com", "https://test.rpc.fastnear.com", "https://near-testnet.drpc.org"];
const HB_KEY = "heartbeat";
const ERR_KEY = "last_error";

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
    const errors = r.done.filter((d) => d.error).map((d) => `${d.action}${d.id ? ` #${d.id}` : ""}: ${d.error}`);
    return { at: r.at, ok: true, actions: r.done.length, errors };
  } catch (e) {
    console.error("tick failed:", e?.stack ?? String(e));
    const error = String(e?.message ?? e).slice(0, 200);
    return { at: new Date().toISOString(), ok: false, error, errors: [`tick: ${error}`] };
  }
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      run(env).then(async (hb) => {
        // Telegram: a problem once when it starts or changes, and once when it is over (not every minute).
        if (env.GUARD_HB) {
          const notify = telegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID);
          const sig = hb.errors.length ? hb.errors.join(" | ").slice(0, 300) : "";
          const prev = (await env.GUARD_HB.get(ERR_KEY)) ?? "";
          if (sig && sig !== prev) {
            await notify(`⚠️ Penjaga Coba Curi bermasalah:\n${hb.errors.join("\n")}`);
            await env.GUARD_HB.put(ERR_KEY, sig);
          } else if (!sig && prev) {
            await notify("✅ Penjaga Coba Curi pulih, tick berjalan normal lagi.");
            await env.GUARD_HB.delete(ERR_KEY);
          }
        }
        // Every 2nd minute, or at once when something happened or failed (KV free tier: 1,000 writes a day).
        if (env.GUARD_HB && (new Date().getUTCMinutes() % 2 === 0 || !hb.ok || hb.actions > 0)) {
          const { errors: _e, ...pub } = hb;
          await env.GUARD_HB.put(HB_KEY, JSON.stringify({ ...pub, runner: "cloudflare", everySec: 60 }));
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
