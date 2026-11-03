// cc_wait_round — wait (up to 25 min) until the guard has closed the Coba Curi round:
// frozen transfers finalized back to the guard, demo account unlocked and refilled.
import { provider, sleep } from "./lib.mjs";

const C = process.env.COBACURI_CONTRACT_ID;
const demoId = process.env.COBACURI_DEMO_ID;
const guardId = process.env.COBACURI_GUARD_ID;
const view = (method, args) => provider.callFunction({ contractId: C, method, args });
const t0 = Date.now();
for (;;) {
  const [acct, bal, out, guardBal] = await Promise.all([
    view("get_account", { account_id: demoId }),
    view("balance_of", { account_id: demoId }),
    view("get_outgoing", { account_id: demoId, limit: 10 }),
    view("balance_of", { account_id: guardId }),
  ]);
  const summary = out.map((t) => `#${t.id} ${t.kind} ${Number(t.amount) / 1e6} ${t.status}${t.final_to ? `→${t.final_to.split(".")[0]}` : ""}`).join(" | ");
  if (!acct.locked && BigInt(bal.available) >= 1_000_000_000n && out.every((t) => t.status !== "Frozen")) {
    console.log(`ROUND CLOSED after ${Math.round((Date.now() - t0) / 60000)} min · demo available ${Number(bal.available) / 1e6} · guard holds ${Number(guardBal.available) / 1e6} · ${summary}`);
    break;
  }
  if (Date.now() - t0 > 25 * 60_000) {
    console.log(`TIMEOUT · locked=${acct.locked} demo=${Number(bal.available) / 1e6} · ${summary}`);
    break;
  }
  await sleep(30_000);
}
