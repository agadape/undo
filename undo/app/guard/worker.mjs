// Cloudflare Worker wrapper for the Coba Curi guard (cron every minute). Not deployed yet: needs a
// Cloudflare account. Secrets: wrangler secret put COBACURI_GUARD_FC_KEY (and the others below).
import { FailoverRpcProvider, JsonRpcProvider } from "near-api-js";
import { tick, telegram } from "./guard.mjs";

const RPCS = ["https://rpc.testnet.fastnear.com", "https://test.rpc.fastnear.com", "https://near-testnet.drpc.org"];

export default {
  async scheduled(_event, env, ctx) {
    const provider = new FailoverRpcProvider(RPCS.map((url) => new JsonRpcProvider({ url })));
    ctx.waitUntil(
      tick({
        provider,
        contractId: env.COBACURI_CONTRACT_ID,
        demoId: env.COBACURI_DEMO_ID,
        guardId: env.COBACURI_GUARD_ID,
        fcKey: env.COBACURI_GUARD_FC_KEY,
        demoKey: env.COBACURI_DEMO_PRIVATE_KEY,
        guardKey: env.COBACURI_GUARD_PRIVATE_KEY,
        notify: telegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID),
      }).then(
        (r) => console.log(JSON.stringify(r)),
        (e) => console.error("tick failed:", e?.stack ?? String(e)),
      ),
    );
  },
};
