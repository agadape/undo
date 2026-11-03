// S7 — scoped agent keys: sub-account, function-call access key limits, revocation, gas keys.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Account, KeyPair, actions, teraToGas, nearToYocto, yoctoToNear } from "near-api-js";
import { NEAR } from "near-api-js/tokens";
import { account, accountId, provider, txSummary, json, sleep } from "./lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GUESTBOOK = "guestbook.near-examples.testnet";
const results = [];
const record = (step, expected, outcome, detail) => {
  const pass = expected === outcome;
  results.push({ step, expected, outcome, pass, detail });
  console.log(`\n[${pass ? "PASS" : "FAIL"}] ${step} — expected ${expected}, got ${outcome}`);
  if (detail) console.log("   ", typeof detail === "string" ? detail.slice(0, 400) : json(detail).slice(0, 600));
};
const errMsg = (e) => (e?.type ? `${e.type}: ` : "") + (e?.message ?? String(e));

async function attempt(step, expected, fn) {
  try {
    const r = await fn();
    const s = r?.transaction ? txSummary(step, r) : null;
    record(step, expected, s && !s.ok ? "rejected" : "allowed", s ? { hash: s.hash, explorer: s.explorer } : r);
    return r;
  } catch (e) {
    record(step, expected, "rejected", errMsg(e));
  }
}

// ---------- 1) Sub-account ----------
const subPrefix = "agent";
const subId = `${subPrefix}.${accountId}`;
let subExists = true;
try { await provider.viewAccount({ accountId: subId }); } catch { subExists = false; }
if (!subExists) {
  const subKey = KeyPair.fromRandom("ed25519");
  const r = await account.createSubAccount({
    accountOrPrefix: subPrefix,
    publicKey: subKey.getPublicKey(),
    nearToTransfer: nearToYocto("0.3"),
  });
  txSummary("create sub-account " + subId, r);
  fs.appendFileSync(path.join(root, ".env"), `NEAR_SUB_ACCOUNT_ID=${subId}\nNEAR_SUB_PRIVATE_KEY=${subKey.toString()}\n`);
  record("create sub-account", "allowed", "allowed", subId);
} else {
  console.log("sub-account already exists:", subId);
}
const subView = await provider.viewAccount({ accountId: subId });
console.log("sub-account balance:", yoctoToNear(subView.amount, 4), "NEAR");

// ---------- 2) Function-call access key scoped to one method ----------
const fcKey = KeyPair.fromRandom("ed25519");
const allowance = nearToYocto("0.05");
const addRes = await account.signAndSendTransaction({
  receiverId: accountId,
  actions: [actions.addFunctionCallAccessKey(fcKey.getPublicKey(), GUESTBOOK, ["add_message"], allowance)],
});
txSummary("add function-call key (guestbook.add_message, allowance 0.05 NEAR)", addRes);
await sleep(1500);

const agent = new Account(accountId, provider, fcKey.toString());

await attempt("FC key: call allowed method add_message", "allowed", () =>
  agent.signAndSendTransaction({
    receiverId: GUESTBOOK,
    actions: [actions.functionCall("add_message", { text: "nh-spike S7 via scoped key" }, teraToGas("30"), 0n)],
  }));

await attempt("FC key: transfer NEAR", "rejected", () =>
  agent.transfer({ token: NEAR, amount: NEAR.toUnits("0.001"), receiverId: subId }));

await attempt("FC key: call allowed method WITH deposit", "rejected", () =>
  agent.signAndSendTransaction({
    receiverId: GUESTBOOK,
    actions: [actions.functionCall("add_message", { text: "paid" }, teraToGas("30"), nearToYocto("0.01"))],
  }));

await attempt("FC key: call other contract (wrap.testnet near_deposit)", "rejected", () =>
  agent.signAndSendTransaction({
    receiverId: "wrap.testnet",
    actions: [actions.functionCall("near_deposit", {}, teraToGas("30"), 0n)],
  }));

await attempt("FC key: add a full-access key to the account", "rejected", () =>
  agent.signAndSendTransaction({
    receiverId: accountId,
    actions: [actions.addFullAccessKey(KeyPair.fromRandom("ed25519").getPublicKey())],
  }));

const keyView = await account.getAccessKey(fcKey.getPublicKey());
console.log("\nFC key view after use:", json(keyView));
const remaining = keyView?.permission?.FunctionCall?.allowance ?? keyView?.permission?.functionCall?.allowance;
if (remaining) console.log("allowance remaining:", yoctoToNear(remaining, 6), "of", yoctoToNear(allowance, 6), "NEAR");

// ---------- 3) Revoke ----------
const del = await account.deleteKey(fcKey.getPublicKey());
txSummary("delete FC key (revoke agent)", del);
await sleep(1500);
await attempt("FC key after revoke: call add_message", "rejected", () =>
  agent.signAndSendTransaction({
    receiverId: GUESTBOOK,
    actions: [actions.functionCall("add_message", { text: "after revoke" }, teraToGas("30"), 0n)],
  }));

// ---------- 4) Gas keys (new protocol feature) ----------
console.log("\n--- gas key probe ---");
const gasKey = KeyPair.fromRandom("ed25519");
try {
  const r1 = await account.addFunctionCallGasKey({
    publicKey: gasKey.getPublicKey(),
    contractId: GUESTBOOK,
    methodNames: ["add_message"],
    numNonces: 4,
  });
  const s1 = txSummary("add function-call GAS key", r1);
  record("add gas key", "allowed", s1.ok ? "allowed" : "rejected", s1.hash);
  const r2 = await account.transferToGasKey(accountId, gasKey.getPublicKey(), nearToYocto("0.05"));
  const s2 = txSummary("fund gas key 0.05 NEAR", r2);
  record("fund gas key", "allowed", s2.ok ? "allowed" : "rejected", s2.hash);
  const nonces = await provider.viewGasKeyNonces?.({ accountId, publicKey: gasKey.getPublicKey().toString() }).catch((e) => errMsg(e));
  console.log("gas key nonces:", json(nonces));
  const balBefore = await account.getBalance();
  const gk = new Account(accountId, provider, gasKey.toString());
  await attempt("gas key: call add_message (gas paid from key balance)", "allowed", () =>
    gk.signAndSendTransaction({
      receiverId: GUESTBOOK,
      actions: [actions.functionCall("add_message", { text: "nh-spike S7 via gas key" }, teraToGas("30"), 0n)],
    }));
  const balAfter = await account.getBalance();
  console.log("account balance delta during gas-key call (yocto):", (balAfter - balBefore).toString());
} catch (e) {
  record("gas key flow", "allowed", "rejected", errMsg(e));
}

console.log("\n=== S7 summary ===");
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} | ${r.step} | expected ${r.expected} | got ${r.outcome}`);
