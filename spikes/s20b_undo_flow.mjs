// S20b — end-to-end Undo scenario on testnet with expected allow/reject checks.
// Roles (all throwaway testnet accounts from .env):
//   victim   = NEAR_ACCOUNT_ID (also the DAO's only council member and, for this spike, the judge)
//   thief    = NEAR_SUB_ACCOUNT_ID   (gets the "stolen" transfer)
//   safe     = NEAR_USER_ACCOUNT_ID  (victim's safe recovery account)
//   watcher  = NEAR_NFT_CONTRACT_ID  (reports the theft, pays the bond)
//   merchant = NEAR_MT_CONTRACT_ID   (normal payment + unwrap to USDC)
import { Account, JsonRpcProvider, actions, teraToGas, nearToYocto, yoctoToNear } from "near-api-js";
import { json, txSummary } from "./lib.mjs";

const provider = new JsonRpcProvider({ url: "https://rpc.testnet.fastnear.com" }); // no failover: clean errors
const env = process.env;
const UNDO = env.NEAR_UNDO_CONTRACT_ID;
const USDC = "usdc.fakes.testnet";
const DAO = "nhspike-mvp6a0dx.sputnikv2.testnet";
if (!UNDO) throw new Error("run s20a_deploy_undo.mjs first");

const acct = (id, key) => new Account(id, provider, key);
const victim = acct(env.NEAR_ACCOUNT_ID, env.NEAR_PRIVATE_KEY);
const thief = acct(env.NEAR_SUB_ACCOUNT_ID, env.NEAR_SUB_PRIVATE_KEY);
const watcher = acct(env.NEAR_NFT_CONTRACT_ID, env.NEAR_NFT_CONTRACT_PRIVATE_KEY);
const merchant = acct(env.NEAR_MT_CONTRACT_ID, env.NEAR_MT_CONTRACT_PRIVATE_KEY);
const safeId = env.NEAR_USER_ACCOUNT_ID;

const USD = (n) => (BigInt(Math.round(n * 1e6))).toString();
const fmt = (u) => (Number(BigInt(u)) / 1e6).toFixed(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (label, pass, detail = "") => {
  results.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} | ${label}${detail ? " | " + detail : ""}`);
};

async function call(signer, receiverId, method, args, { gas = "50", deposit = 0n } = {}) {
  const res = await signer.signAndSendTransaction({
    receiverId,
    actions: [actions.functionCall(method, args, teraToGas(gas), deposit)],
  });
  return txSummary(`${signer.accountId.split(".")[0]} → ${method}`, res);
}
async function expectFail(label, fn, needle) {
  try {
    await fn();
    check(label, false, "expected a rejection but the call succeeded");
  } catch (e) {
    const msg = (e?.message ?? String(e)).replace(/\s+/g, " ");
    check(label, msg.includes(needle), msg.slice(0, 160));
  }
}
const view = (method, args) => provider.callFunction({ contractId: UNDO, method, args });
const bal = async (id) => {
  const b = await view("balance_of", { account_id: id });
  return { available: fmt(b.available), pending_in: fmt(b.pending_in), disputed_in: fmt(b.disputed_in), pending_exit: fmt(b.pending_exit) };
};
const config = await view("get_config", {});
console.log("contract", UNDO, json(config));
const windowMs = config.window_sec * 1000;

// ---------- 0) setup: USDC for the victim, USDC registration for the merchant, wrap 50 USDC ----------
await call(victim, USDC, "mint", { account_id: victim.accountId, amount: USD(100) });
try {
  await call(victim, USDC, "storage_deposit", { account_id: merchant.accountId, registration_only: true }, { deposit: nearToYocto("0.00125") });
} catch (e) { console.log("merchant USDC registration:", e.message.slice(0, 100)); }
await call(victim, USDC, "ft_transfer_call", { receiver_id: UNDO, amount: USD(50), msg: "" }, { gas: "100", deposit: 1n });
const vb0 = await bal(victim.accountId);
check("wrap 50 USDC → 50 rUSDC available", vb0.available === "50.00", json(vb0));

// ---------- 1) theft: attacker uses the victim's key to send 30 rUSDC to the thief ----------
const theft = await call(victim, UNDO, "transfer", { receiver_id: thief.accountId, amount: USD(30), memo: "simulated theft (spike)" }, { deposit: 1n });
const theftId = JSON.parse(theft.successValue);
const tb1 = await bal(thief.accountId);
check("thief sees 30 rUSDC only as pending", tb1.pending_in === "30.00" && tb1.available === "0.00", json(tb1));
await expectFail("thief cannot unwrap pending funds", () => call(thief, UNDO, "unwrap", { amount: USD(1) }, { deposit: 1n }), "not enough available rUSDC");
await expectFail("thief cannot forward pending funds", () => call(thief, UNDO, "transfer", { receiver_id: merchant.accountId, amount: USD(1) }, { deposit: 1n }), "not enough available rUSDC");

// ---------- 2) report + verdict ----------
await expectFail("report without the exact bond is rejected", () => call(watcher, UNDO, "report", { transfer_id: theftId, reason: "x" }, { deposit: nearToYocto("0.001") }), "attach exactly the report bond");
const watcherBefore = BigInt((await provider.viewAccount({ accountId: watcher.accountId })).amount);
await call(watcher, UNDO, "report", { transfer_id: theftId, reason: "Victim says the key was stolen; funds moved to a fresh account" }, { deposit: nearToYocto("0.01") });
check("theft is now Disputed (frozen)", (await view("get_transfer", { transfer_id: theftId })).status === "Disputed");
await call(victim, UNDO, "post_verdict", {
  transfer_id: theftId, stolen: true, confidence: 90, model: "MOCK (S5b pending)",
  request_hash: "sha256:mock-request", response_hash: "sha256:mock-response", signature: "mock",
});
await expectFail("non-judge cannot post a verdict", () => call(thief, UNDO, "post_verdict", { transfer_id: theftId, stolen: false, confidence: 99, model: "x", request_hash: "x", response_hash: "x", signature: "x" }), "only the judge");
await expectFail("thief cannot resolve the dispute", () => call(thief, UNDO, "resolve", { transfer_id: theftId, reverse: false }), "only the council");

// ---------- 3) council (Sputnik DAO) votes to reverse to the victim's safe account ----------
const policy = await provider.callFunction({ contractId: DAO, method: "get_policy", args: {} });
const resolveArgs = { transfer_id: theftId, reverse: true, refund_to: safeId };
const kind = {
  FunctionCall: {
    receiver_id: UNDO,
    actions: [{ method_name: "resolve", args: Buffer.from(JSON.stringify(resolveArgs)).toString("base64"), deposit: "0", gas: teraToGas("30").toString() }],
  },
};
const prop = await call(victim, DAO, "add_proposal", { proposal: { description: `Undo transfer #${theftId}: reported theft, AI verdict stolen=true`, kind } }, { gas: "100", deposit: BigInt(policy.proposal_bond) });
const propId = Number(prop.successValue);
const t0 = Date.now();
const vote = await call(victim, DAO, "act_proposal", { id: propId, action: "VoteApprove", proposal: kind }, { gas: "200" });
console.log(`DAO vote → resolve executed in ${Date.now() - t0} ms; logs:`, vote.logs);
await sleep(1500);
const p = await provider.callFunction({ contractId: DAO, method: "get_proposal", args: { id: propId } });
const t = await view("get_transfer", { transfer_id: theftId });
check("DAO proposal Approved", p.status === "Approved", p.status);
check("transfer Reversed to the safe account", t.status === "Reversed" && t.refund_to === safeId, json({ status: t.status, refund_to: t.refund_to }));
const sb = await bal(safeId);
const tb2 = await bal(thief.accountId);
check("safe account received 30 rUSDC", sb.available === "30.00", json(sb));
check("thief ends with nothing", tb2.available === "0.00" && tb2.pending_in === "0.00" && tb2.disputed_in === "0.00", json(tb2));
const watcherAfter = BigInt((await provider.viewAccount({ accountId: watcher.accountId })).amount);
check("watcher's bond came back (minus gas)", watcherAfter > watcherBefore - nearToYocto("0.005"), `delta ${yoctoToNear(watcherAfter - watcherBefore, 5)} NEAR`);

// ---------- 4) normal payment: settles after the window, then unwraps to USDC after a second window ----------
const pay = await call(victim, UNDO, "transfer", { receiver_id: merchant.accountId, amount: USD(5), memo: "order #1" }, { deposit: 1n });
const payId = JSON.parse(pay.successValue);
check("merchant sees 5 rUSDC pending", (await bal(merchant.accountId)).pending_in === "5.00");
console.log(`waiting ${config.window_sec + 5}s for the undo window...`);
await sleep(windowMs + 5000);
await expectFail("report after the window is rejected", () => call(watcher, UNDO, "report", { transfer_id: payId, reason: "late" }, { deposit: nearToYocto("0.01") }), "undo window has closed");
check("after the window the merchant's 5 rUSDC are available", (await bal(merchant.accountId)).available === "5.00");
const usdcBefore = BigInt(await provider.callFunction({ contractId: USDC, method: "ft_balance_of", args: { account_id: merchant.accountId } }));
const un = await call(merchant, UNDO, "unwrap", { amount: USD(5) }, { deposit: 1n });
const exitId = JSON.parse(un.successValue);
await expectFail("withdraw inside the exit window is rejected", () => call(merchant, UNDO, "withdraw", { transfer_id: exitId }, { gas: "60" }), "still inside the undo window");
console.log(`waiting ${config.window_sec + 5}s for the exit window...`);
await sleep(windowMs + 5000);
const w = await call(merchant, UNDO, "withdraw", { transfer_id: exitId }, { gas: "60" });
await sleep(1500);
const usdcAfter = BigInt(await provider.callFunction({ contractId: USDC, method: "ft_balance_of", args: { account_id: merchant.accountId } }));
check("merchant received 5 USDC on withdraw", usdcAfter - usdcBefore === BigInt(USD(5)), `USDC ${fmt(usdcBefore)} → ${fmt(usdcAfter)}; tx ${w.hash}`);

// ---------- 5) invariant ----------
const cfg = await view("get_config", {});
const held = await provider.callFunction({ contractId: USDC, method: "ft_balance_of", args: { account_id: UNDO } });
check("USDC held by contract ≥ rUSDC total supply", BigInt(held) >= BigInt(cfg.total_supply), `held ${fmt(held)} vs supply ${fmt(cfg.total_supply)}`);

console.log("\n=== S20 summary ===");
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} | ${r.label}`);
console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
console.log("key txs:", json({ theft: theft.explorer, report_and_vote: vote.explorer, withdraw: w.explorer }));
