// v2_public_deploy — the public v2 demo contract (trusted contacts) for judges: same humane windows as the v1
// demo, court pinned to the attested NEAR AI key and the app's prompt through the S8 DAO, then LOCKED.
//   node v2_public_deploy.mjs <path/to/undo_token.wasm>          (dry run: checks and prints, sends nothing)
//   node v2_public_deploy.mjs <path/to/undo_token.wasm> --send   (account, deploy, DAO pin, lock)
// Use the REPRODUCIBLE build (cargo near build reproducible-wasm) so anyone can rebuild the code hash.
// Run it while the DAO council has one member: with more, the pin proposal needs more votes (printed).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Account, KeyPair, actions, baseEncode, teraToGas, nearToYocto } from "near-api-js";
import { AttestationClient, verifyModelAttestation } from "@nearai/inference-sdk/node";
import { account as main, provider, sleep, EXPLORER } from "./lib.mjs";
import { MODEL, PROMPT, sha256hex } from "../undo/app/lib/court.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, "..", ".env");
const wasmPath = process.argv[2];
const SEND = process.argv.includes("--send");
if (!wasmPath || !fs.existsSync(wasmPath)) {
  console.log("usage: node v2_public_deploy.mjs <path/to/undo_token.wasm> [--send]");
  process.exit(1);
}
if (process.env.NEAR_UNDO_V2_CONTRACT_ID) {
  console.log("already deployed:", process.env.NEAR_UNDO_V2_CONTRACT_ID);
  process.exit(0);
}
const USDC = "usdc.fakes.testnet";
const DAO = "nhspike-mvp6a0dx.sputnikv2.testnet";
const CFG = { window_sec: 300, contest_window_sec: 120, evidence_window_sec: 300, dispute_timeout_sec: 1800, recovery_delay_sec: 120, contact_delay_sec: 300 };
const MAX_TOKENS = 2000;

const wasm = fs.readFileSync(wasmPath);
const codeHash = baseEncode(crypto.createHash("sha256").update(wasm).digest());
const policy = await provider.callFunction({ contractId: DAO, method: "get_policy", args: {} });
const council = policy.roles.find((r) => r.name === "council").kind.Group;

// Real model key first (free): stop before spending anything if attestation fails.
const att = new AttestationClient({ apiKey: process.env.NEAR_AI_API_KEY });
const fetched = await att.fetchModelAttestations({ model: MODEL, signingAlgo: "ed25519" });
const verified = [];
for (const a of fetched.attestations) {
  try {
    verified.push(await verifyModelAttestation({ attestation: a, clientBinding: fetched.clientBinding }));
  } catch {}
}
const modelPub = verified.find((v) => v.signingPublicKey)?.signingPublicKey?.replace(/^0x/, "");
const v1 = await provider.callFunction({ contractId: process.env.NEAR_UNDO_DEMO_CONTRACT_ID, method: "get_config", args: {} });
console.log(
  JSON.stringify({
    wasmBytes: wasm.length,
    codeHash,
    model: MODEL,
    modelKeyVerified: !!modelPub,
    sameKeyAsV1: modelPub === v1.court.signer,
    prompt: sha256hex(PROMPT),
    samePromptAsV1: sha256hex(PROMPT) === v1.court.prompt_sha256,
    council,
    votesNeeded: Math.floor(council.length / 2) + 1,
    cfg: CFG,
  }),
);
if (!modelPub) {
  console.log("no verified model key — stopping");
  process.exit(1);
}
if (!SEND) {
  console.log("dry run (add --send to deploy)");
  process.exit(0);
}

// 1) Account: the testnet helper (10 NEAR) for a clean name, else a sub-account of the S26-real account.
const kp = KeyPair.fromRandom("ed25519");
let id = "";
for (const name of ["undo-demo-v2.testnet", `undo-v2-${Math.random().toString(36).slice(2, 8)}.testnet`]) {
  try {
    const res = await fetch("https://helper.nearprotocol.com/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newAccountId: name, newAccountPublicKey: kp.getPublicKey().toString() }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      id = name;
      break;
    }
  } catch {}
}
if (!id) {
  // Storage: ~1 NEAR per 100 KB of wasm, plus state and gas.
  const need = (BigInt(wasm.length) * 10n ** 19n) + nearToYocto("0.3");
  const parentId = process.env.NEAR_S26_REAL_CONTRACT_ID;
  const pv = await provider.viewAccount({ accountId: parentId });
  const spendable = BigInt(pv.amount) - BigInt(pv.storage_usage) * 10n ** 19n - nearToYocto("0.05");
  if (spendable < need) {
    console.log(`testnet helper refused and ${parentId} can spend only ${Number(spendable / 10n ** 21n) / 1000} NEAR (need ${Number(need / 10n ** 21n) / 1000}): top it up from a faucet and run again. Nothing was sent.`);
    process.exit(2);
  }
  const parent = new Account(parentId, provider, process.env.NEAR_S26_REAL_CONTRACT_PRIVATE_KEY);
  await parent.createSubAccount({ accountOrPrefix: "demo2", publicKey: kp.getPublicKey(), nearToTransfer: need });
  id = `demo2.${parent.accountId}`;
}
for (let i = 0; i < 15; i++) {
  try {
    await provider.viewAccount({ accountId: id });
    break;
  } catch {
    await sleep(2000);
  }
}
fs.appendFileSync(envPath, `NEAR_UNDO_V2_CONTRACT_ID=${id}\n`);
const contract = new Account(id, provider, kp.toString());
console.log("v2 demo contract:", id);

// 2) Deploy + init, register on USDC.
const dep = await contract.signAndSendTransaction({
  receiverId: id,
  actions: [
    actions.deployContract(new Uint8Array(wasm)),
    actions.functionCall("new", { underlying: USDC, council: DAO, ...CFG, bond: nearToYocto("0.01").toString(), storage_fee: nearToYocto("0.005").toString() }, teraToGas("50"), 0n),
  ],
});
console.log("deploy + new:", EXPLORER + dep.transaction.hash);
await main.signAndSendTransaction({ receiverId: USDC, actions: [actions.functionCall("storage_deposit", { account_id: id, registration_only: true }, teraToGas("30"), nearToYocto("0.00125"))] });

// 3) Lock: delete the only key (council calls still work; nobody can change the code).
const lock = await contract.signAndSendTransaction({ receiverId: id, actions: [actions.deleteKey(kp.getPublicKey())] });
console.log("lock:", EXPLORER + lock.transaction.hash);

// 4) Council pins the court through the DAO.
const fn = (method, args) => ({ method_name: method, args: Buffer.from(JSON.stringify(args)).toString("base64"), deposit: "0", gas: teraToGas("50").toString() });
const kind = { FunctionCall: { receiver_id: id, actions: [fn("register_tee_signer", { model_id: MODEL, signer_pk_hex: modelPub }), fn("register_procedure", { prompt_sha256_hex: sha256hex(PROMPT), max_tokens: MAX_TOKENS })] } };
const prop = await main.signAndSendTransaction({ receiverId: DAO, actions: [actions.functionCall("add_proposal", { proposal: { description: `Undo v2 demo ${id}: pin court`, kind } }, teraToGas("100"), BigInt(policy.proposal_bond))] });
const pid = Number(Buffer.from(prop.status.SuccessValue, "base64").toString());
const vote = await main.signAndSendTransaction({ receiverId: DAO, actions: [actions.functionCall("act_proposal", { id: pid, action: "VoteApprove", proposal: kind }, teraToGas("250"), 0n)] });
console.log("DAO pin: proposal", pid, EXPLORER + vote.transaction.hash, council.length > 1 ? `(needs ${Math.floor(council.length / 2) + 1} votes)` : "");
await sleep(2500);

const cfg = await provider.callFunction({ contractId: id, method: "get_config", args: {} });
const keys = await provider.viewAccessKeyList({ accountId: id });
const acct = await provider.viewAccount({ accountId: id });
console.log(
  JSON.stringify({
    keys: (keys.keys ?? []).length,
    codeHash: acct.code_hash,
    codeHashMatchesWasm: acct.code_hash === codeHash,
    signer: cfg.court.signer === modelPub,
    procedure: cfg.court.prompt_sha256 === sha256hex(PROMPT),
    contactDelay: cfg.contact_delay_sec,
    window: cfg.window_sec,
  }),
);
