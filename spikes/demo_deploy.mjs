// demo_deploy — the public demo contract for judges (testnet): humane windows, court pinned to the
// real attested NEAR AI key through the S8 DAO, then LOCKED (its only key deleted).
//   node demo_deploy.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Account, KeyPair, actions, teraToGas, nearToYocto } from "near-api-js";
import { AttestationClient, verifyModelAttestation } from "@nearai/inference-sdk/node";
import { account as main, provider, sleep, EXPLORER } from "./lib.mjs";
import { MODEL, PROMPT, sha256hex } from "./s26_lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, "..", ".env");
const wasmPath = path.join(here, "..", "undo", "contracts", "wasm", "undo_token.wasm");
const USDC = "usdc.fakes.testnet";
const DAO = "nhspike-mvp6a0dx.sputnikv2.testnet";
const CFG = { window_sec: 300, contest_window_sec: 120, evidence_window_sec: 300, dispute_timeout_sec: 1800, recovery_delay_sec: 120 };
if (process.env.NEAR_UNDO_DEMO_CONTRACT_ID) { console.log("already deployed:", process.env.NEAR_UNDO_DEMO_CONTRACT_ID); process.exit(0); }

// 0) Real model key first (free) — stop before deploying if attestation fails.
const att = new AttestationClient({ apiKey: process.env.NEAR_AI_API_KEY });
const fetched = await att.fetchModelAttestations({ model: MODEL, signingAlgo: "ed25519" });
const verified = [];
for (const a of fetched.attestations) { try { verified.push(await verifyModelAttestation({ attestation: a, clientBinding: fetched.clientBinding })); } catch {} }
const modelPub = verified.find((v) => v.signingPublicKey)?.signingPublicKey?.replace(/^0x/, "");
if (!modelPub) { console.log("no verified model key — stopping"); process.exit(1); }

// 1) Account: testnet helper for a clean name, else a sub-account of the S26-real account.
const kp = KeyPair.fromRandom("ed25519");
let id = "undo-demo.testnet";
let ok = false;
try {
  const res = await fetch("https://helper.nearprotocol.com/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }) });
  ok = res.ok;
} catch {}
if (!ok) {
  const parent = new Account(process.env.NEAR_S26_REAL_CONTRACT_ID, provider, process.env.NEAR_S26_REAL_CONTRACT_PRIVATE_KEY);
  await parent.createSubAccount({ accountOrPrefix: "demo", publicKey: kp.getPublicKey(), nearToTransfer: nearToYocto("4") });
  id = `demo.${parent.accountId}`;
}
for (let i = 0; i < 15; i++) { try { await provider.viewAccount({ accountId: id }); break; } catch { await sleep(2000); } }
fs.appendFileSync(envPath, `NEAR_UNDO_DEMO_CONTRACT_ID=${id}\n`);
const contract = new Account(id, provider, kp.toString());
console.log("demo contract:", id);

// 2) Deploy + init, register on USDC
const dep = await contract.signAndSendTransaction({
  receiverId: id,
  actions: [
    actions.deployContract(new Uint8Array(fs.readFileSync(wasmPath))),
    actions.functionCall("new", { underlying: USDC, council: DAO, ...CFG, bond: nearToYocto("0.01").toString(), storage_fee: nearToYocto("0.005").toString() }, teraToGas("50"), 0n),
  ],
});
console.log("deploy + new:", EXPLORER + dep.transaction.hash);
await main.signAndSendTransaction({ receiverId: USDC, actions: [actions.functionCall("storage_deposit", { account_id: id, registration_only: true }, teraToGas("30"), nearToYocto("0.00125"))] });

// 3) Lock: delete the only key (council calls still work; nobody can change the code).
await contract.signAndSendTransaction({ receiverId: id, actions: [actions.deleteKey(kp.getPublicKey())] });

// 4) Council pins the court through the DAO.
const policy = await provider.callFunction({ contractId: DAO, method: "get_policy", args: {} });
const fn = (method, args) => ({ method_name: method, args: Buffer.from(JSON.stringify(args)).toString("base64"), deposit: "0", gas: teraToGas("50").toString() });
const kind = { FunctionCall: { receiver_id: id, actions: [fn("register_tee_signer", { model_id: MODEL, signer_pk_hex: modelPub }), fn("register_procedure", { prompt_sha256_hex: sha256hex(PROMPT), max_tokens: 2000 })] } };
const prop = await main.signAndSendTransaction({ receiverId: DAO, actions: [actions.functionCall("add_proposal", { proposal: { description: `Undo demo ${id}: pin court`, kind } }, teraToGas("100"), BigInt(policy.proposal_bond))] });
const pid = Number(Buffer.from(prop.status.SuccessValue, "base64").toString());
const vote = await main.signAndSendTransaction({ receiverId: DAO, actions: [actions.functionCall("act_proposal", { id: pid, action: "VoteApprove", proposal: kind }, teraToGas("250"), 0n)] });
console.log("DAO pin:", EXPLORER + vote.transaction.hash);
await sleep(2000);

const cfg = await provider.callFunction({ contractId: id, method: "get_config", args: {} });
const keys = await provider.viewAccessKeyList({ accountId: id });
const acct = await provider.viewAccount({ accountId: id });
console.log(JSON.stringify({ keys: (keys.keys ?? []).length, codeHash: acct.code_hash, signer: cfg.court.signer === modelPub, procedure: cfg.court.prompt_sha256 === sha256hex(PROMPT), maxTokens: cfg.court.max_tokens, window: cfg.window_sec }));
