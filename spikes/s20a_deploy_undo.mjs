// S20a — create a fresh testnet account for the Undo token, deploy + init it, register it on USDC.
// The new account's key goes to ../.env only (never printed).
//   node s20a_deploy_undo.mjs [windowSec=60]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Account, JsonRpcProvider, KeyPair, actions, teraToGas, nearToYocto, yoctoToNear } from "near-api-js";
import { account as main, accountId as mainId, json, txSummary } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, "..", ".env");
const wasmPath = path.join(here, "..", "undo", "contracts", "wasm", "undo_token.wasm");
const USDC = "usdc.fakes.testnet";
const DAO = "nhspike-mvp6a0dx.sputnikv2.testnet"; // council from S8 (our account is its only member)
const windowSec = Number(process.argv[2] ?? 60);
const provider = new JsonRpcProvider({ url: "https://rpc.testnet.fastnear.com" });

if (process.env.NEAR_UNDO_CONTRACT_ID) {
  console.log("Undo contract already in .env:", process.env.NEAR_UNDO_CONTRACT_ID, "(delete the two NEAR_UNDO_* lines to deploy a fresh one)");
  process.exit(0);
}

// 1) New account via the testnet helper
const kp = KeyPair.fromRandom("ed25519");
const id = `nh-undo-${Date.now().toString(36)}.testnet`;
const res = await fetch("https://helper.nearprotocol.com/account", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }),
});
console.log(`helper -> HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
if (!res.ok) process.exit(1);
fs.appendFileSync(envPath, `NEAR_UNDO_CONTRACT_ID=${id}\nNEAR_UNDO_CONTRACT_PRIVATE_KEY=${kp.toString()}\n`);
console.log("saved", id, "to .env");

let view;
for (let i = 0; i < 15; i++) {
  try { view = await provider.viewAccount({ accountId: id }); break; } catch { await new Promise((r) => setTimeout(r, 2000)); }
}
console.log("new account balance:", yoctoToNear(view.amount, 4), "NEAR");

// 2) Deploy + init in one transaction
const contract = new Account(id, provider, kp.toString());
const wasm = fs.readFileSync(wasmPath);
const initArgs = {
  underlying: USDC,
  council: DAO,
  judge: mainId, // spike: our main account posts verdicts; S5b will replace this with the NEAR AI judge server
  window_sec: windowSec,
  dispute_timeout_sec: 3600,
  report_bond: nearToYocto("0.01").toString(),
};
const dep = await contract.signAndSendTransaction({
  receiverId: id,
  actions: [actions.deployContract(new Uint8Array(wasm)), actions.functionCall("new", initArgs, teraToGas("100"), 0n)],
});
txSummary("deploy + new", dep);

// 3) Register the contract on USDC so it can receive and send USDC
const reg = await main.signAndSendTransaction({
  receiverId: USDC,
  actions: [actions.functionCall("storage_deposit", { account_id: id, registration_only: true }, teraToGas("30"), nearToYocto("0.00125"))],
});
txSummary("USDC storage_deposit for contract", reg);

console.log("config:", json(await provider.callFunction({ contractId: id, method: "get_config", args: {} })));
const after = await provider.viewAccount({ accountId: id });
console.log("contract balance:", yoctoToNear(after.amount, 4), "NEAR, storage", after.storage_usage, "bytes");
