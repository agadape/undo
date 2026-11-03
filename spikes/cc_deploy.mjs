// cc_deploy — deploy the "Coba Curi" challenge instance (testnet, free).
// - Contract: undo-token v1 with challenge parameters (2 h window, 15 min contest, 7 d timeout), then LOCKED.
// - Guard (penjaga): the demo account's recovery account; gets a function-call key limited to
//   panic / finalize / unlock / release_expired on the challenge contract.
// - Demo account: a sub-account of the guard (only the guard can recreate it), funded with 1000 rUSDC.
//   Its private key is the one meant to be PUBLISHED; here it only goes to ../.env.
// All keys -> ../.env (never printed).
//   node cc_deploy.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Account, KeyPair, actions, teraToGas, nearToYocto } from "near-api-js";
import { provider, sleep, EXPLORER } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, "..", ".env");
const wasmPath = path.join(here, "..", "undo", "contracts", "wasm", "undo_token.wasm");
const USDC = "usdc.fakes.testnet";
const DAO = "nhspike-mvp6a0dx.sputnikv2.testnet";
const CFG = { window_sec: 7200, contest_window_sec: 900, evidence_window_sec: 3600, dispute_timeout_sec: 604800, recovery_delay_sec: 604800 };
const USD = (n) => String(Math.round(n * 1e6));

if (process.env.COBACURI_CONTRACT_ID) { console.log("already deployed:", process.env.COBACURI_CONTRACT_ID); process.exit(0); }
const env = {};
const saveEnv = () => fs.appendFileSync(envPath, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");

async function helper(id, kp) {
  try {
    const res = await fetch("https://helper.nearprotocol.com/account", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }),
    });
    if (!res.ok) return false;
    for (let i = 0; i < 15; i++) { try { await provider.viewAccount({ accountId: id }); return true; } catch { await sleep(2000); } }
  } catch {}
  return false;
}
async function call(acct, receiverId, method, args, deposit = 0n, gas = "100") {
  const r = await acct.signAndSendTransaction({ receiverId, actions: [actions.functionCall(method, args, teraToGas(gas), deposit)] });
  if (r.status?.Failure) throw new Error(`${method}: ${JSON.stringify(r.status.Failure).slice(0, 200)}`);
  return r;
}

// 1) Guard + contract accounts
const fallbackParent = new Account(process.env.NEAR_S26_FAKE_CONTRACT_ID, provider, process.env.NEAR_S26_FAKE_CONTRACT_PRIVATE_KEY);
const guardKp = KeyPair.fromRandom("ed25519");
let guardId = "penjaga-cobacuri.testnet";
let guard;
if (await helper(guardId, guardKp)) {
  guard = new Account(guardId, provider, guardKp.toString());
  env.COBACURI_GUARD_ID = guardId; env.COBACURI_GUARD_PRIVATE_KEY = guardKp.toString();
} else {
  guardId = fallbackParent.accountId; // helper rate-limited: the S26-fake account becomes the guard
  guard = fallbackParent;
  env.COBACURI_GUARD_ID = guardId; env.COBACURI_GUARD_PRIVATE_KEY = process.env.NEAR_S26_FAKE_CONTRACT_PRIVATE_KEY;
}
console.log("guard:", guardId);

const cKp = KeyPair.fromRandom("ed25519");
let contractId = "cobacuri-undo.testnet";
if (!(await helper(contractId, cKp))) {
  await guard.createSubAccount({ accountOrPrefix: "cobacuri", publicKey: cKp.getPublicKey(), nearToTransfer: nearToYocto("3.8") });
  contractId = `cobacuri.${guardId}`;
}
const contract = new Account(contractId, provider, cKp.toString());
env.COBACURI_CONTRACT_ID = contractId;
saveEnv(); // keep keys even if a later step fails
for (const k of Object.keys(env)) delete env[k];
console.log("contract:", contractId);

// 2) Deploy + init
const dep = await contract.signAndSendTransaction({
  receiverId: contractId,
  actions: [
    actions.deployContract(new Uint8Array(fs.readFileSync(wasmPath))),
    actions.functionCall("new", { underlying: USDC, council: DAO, ...CFG, bond: nearToYocto("0.01").toString(), storage_fee: nearToYocto("0.005").toString() }, teraToGas("50"), 0n),
  ],
});
console.log("deploy + new:", EXPLORER + dep.transaction.hash);
await call(guard, USDC, "storage_deposit", { account_id: contractId, registration_only: true }, nearToYocto("0.00125"), "30");

// 3) Demo account (sub-account of the guard) with the key meant for publication
const demoKp = KeyPair.fromRandom("ed25519");
await guard.createSubAccount({ accountOrPrefix: "curi", publicKey: demoKp.getPublicKey(), nearToTransfer: nearToYocto("0.5") });
const demoId = `curi.${guardId}`;
const demo = new Account(demoId, provider, demoKp.toString());
env.COBACURI_DEMO_ID = demoId; env.COBACURI_DEMO_PRIVATE_KEY = demoKp.toString();
saveEnv(); for (const k of Object.keys(env)) delete env[k];
console.log("demo account:", demoId);

await call(demo, contractId, "set_recovery", { recovery_id: guardId }, 0n, "30");
await call(guard, USDC, "storage_deposit", { account_id: demoId, registration_only: true }, nearToYocto("0.00125"), "30");
await call(guard, USDC, "storage_deposit", { account_id: guardId, registration_only: true }, nearToYocto("0.00125"), "30").catch(() => {});
await call(guard, USDC, "mint", { account_id: demoId, amount: USD(1000) }, 0n, "30");
await call(demo, USDC, "ft_transfer_call", { receiver_id: contractId, amount: USD(1000), msg: "" }, 1n, "100");
const bal = await provider.callFunction({ contractId, method: "balance_of", args: { account_id: demoId } });
console.log("demo balance:", bal.available, "| recovery:", (await provider.callFunction({ contractId, method: "get_account", args: { account_id: demoId } })).recovery);

// 4) Guard key that can only panic / finalize / unlock / release_expired on this contract
const fcKp = KeyPair.fromRandom("ed25519");
await guard.signAndSendTransaction({ receiverId: guardId, actions: [actions.addFunctionCallAccessKey(fcKp.getPublicKey(), contractId, ["panic", "finalize", "unlock", "release_expired"], nearToYocto("1"))] });
env.COBACURI_GUARD_FC_KEY = fcKp.toString();
saveEnv(); for (const k of Object.keys(env)) delete env[k];
console.log("guard function-call key added");

// 5) Lock the challenge contract: delete its only key
await contract.signAndSendTransaction({ receiverId: contractId, actions: [actions.deleteKey(cKp.getPublicKey())] });
await sleep(2000);
const keys = await provider.viewAccessKeyList({ accountId: contractId });
const acct = await provider.viewAccount({ accountId: contractId });
console.log("contract keys:", (keys.keys ?? []).length, "| code hash:", acct.code_hash);
