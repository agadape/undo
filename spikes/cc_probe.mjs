// cc_probe — a harmless live test of the Coba Curi guard: the bait account (published key) sends 1 rUSDC to
// the GUARD account itself (so nothing counts as cashed out), then we wait for the guard's panic and print the
// reaction time, the panic tx and which runner wrote the latest heartbeat. The guard then finalizes after the
// contest window (15 min), unlocks and refills the bait on its own; Telegram gets a message at each step.
//   node cc_probe.mjs
import { Account, actions, teraToGas, nearToYocto } from "near-api-js";
import { provider, sleep, EXPLORER } from "./lib.mjs";

const C = process.env.COBACURI_CONTRACT_ID;
const demoId = process.env.COBACURI_DEMO_ID;
const guardId = process.env.COBACURI_GUARD_ID;
const demo = new Account(demoId, provider, process.env.COBACURI_DEMO_PRIVATE_KEY);
const view = (method, args) => provider.callFunction({ contractId: C, method, args, blockQuery: { finality: "optimistic" } });

const before = await view("balance_of", { account_id: demoId });
console.log("bait before:", JSON.stringify(before));
if (before.locked) {
  console.log("the bait is locked (a round is still open): run this after the guard unlocks it");
  process.exit(1);
}
const t0 = Date.now();
const r = await demo.signAndSendTransaction({
  receiverId: C,
  actions: [actions.functionCall("transfer", { receiver_id: guardId, amount: "1000000", memo: "probe" }, teraToGas("50"), nearToYocto("0.005"))],
});
const id = Buffer.from(r.status.SuccessValue, "base64").toString().replace(/"/g, "");
console.log(`probe: #${id} 1 rUSDC bait → guard`, EXPLORER + r.transaction.hash);

for (let i = 0; i < 100; i++) {
  await sleep(3000);
  const t = await view("get_transfer", { transfer_id: id });
  if (t.status === "Frozen") {
    const reaction = Math.round((Date.now() - t0) / 1000);
    const onChain = Number((BigInt(t.frozen_until) - 900n * 1_000_000_000n - BigInt(t.created_at)) / 1_000_000_000n);
    console.log(`guard panicked: #${id} Frozen after ~${reaction} s (on chain: ${onChain} s after the transfer)`);
    // The panic tx, signed by the guard's function-call key, from the FastNear transactions API.
    const txs = await fetch("https://tx.test.fastnear.com/v0/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_id: guardId }) })
      .then((x) => x.json())
      .catch(() => null);
    const latest = (txs?.account_txs ?? []).filter((x) => x.is_signer).sort((a, b) => Number(BigInt(b.tx_block_timestamp) - BigInt(a.tx_block_timestamp)))[0];
    if (latest) console.log("panic tx (latest signed by the guard):", EXPLORER + latest.transaction_hash);
    const hb = await fetch("https://undo-cobacuri-guard.agadape.workers.dev/").then((x) => x.json()).catch(() => null);
    console.log("Cloudflare heartbeat:", JSON.stringify(hb));
    process.exit(0);
  }
}
console.log("no panic within 5 minutes");
process.exit(1);
