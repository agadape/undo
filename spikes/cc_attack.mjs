// cc_attack — act as an attacker holding the Coba Curi demo key (testnet), then watch the guard react.
//   node cc_attack.mjs
import { Account, actions, teraToGas, nearToYocto } from "near-api-js";
import { provider, accountId as attacker, sleep, EXPLORER } from "./lib.mjs";

const C = process.env.COBACURI_CONTRACT_ID;
const demoId = process.env.COBACURI_DEMO_ID;
const demo = new Account(demoId, provider, process.env.COBACURI_DEMO_PRIVATE_KEY);
const FEE = nearToYocto("0.005");
const view = (method, args) => provider.callFunction({ contractId: C, method, args });

async function attempt(label, method, args, deposit = FEE) {
  try {
    const r = await demo.signAndSendTransaction({ receiverId: C, actions: [actions.functionCall(method, args, teraToGas("50"), deposit)] });
    const fail = r.status?.Failure ? JSON.stringify(r.status.Failure).match(/panicked: ([^"\\]+)/)?.[1] : null;
    const v = r.status?.SuccessValue ? Buffer.from(r.status.SuccessValue, "base64").toString() : "";
    console.log(`${fail ? "rejected" : "sent"}  ${label}${fail ? ` -> ${fail}` : ` (id ${v})`}  ${EXPLORER + r.transaction.hash}`);
  } catch (e) {
    console.log(`error   ${label}: ${String(e.message).slice(0, 120)}`);
  }
}

console.log("demo before:", JSON.stringify(await view("balance_of", { account_id: demoId })));
const t0 = Date.now();
await attempt("steal 300 rUSDC to the attacker", "transfer", { receiver_id: attacker, amount: "300000000" });
await attempt("send 200 USDC to the attacker", "send_usdc", { receiver_id: attacker, amount: "200000000" });
await attempt("swap the recovery account to the attacker", "set_recovery", { recovery_id: attacker }, 0n);

for (let i = 0; i < 18; i++) {
  await sleep(5000);
  const out = await view("get_outgoing", { account_id: demoId, limit: 5 });
  const acct = await view("get_account", { account_id: demoId });
  const frozen = out.filter((t) => t.status === "Frozen");
  if (acct.locked && frozen.length >= 2) {
    console.log(`guard reacted after ~${Math.round((Date.now() - t0) / 1000)} s: account locked, frozen: ${frozen.map((t) => `#${t.id} ${t.kind} ${Number(t.amount) / 1e6}`).join(", ")}; recovery swap pending: ${!!acct.pending_recovery}`);
    break;
  }
}
await attempt("try again while locked", "transfer", { receiver_id: attacker, amount: "1000000" });
console.log("demo after:", JSON.stringify(await view("balance_of", { account_id: demoId })));
