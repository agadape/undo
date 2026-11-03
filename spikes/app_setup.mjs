// app_setup — prepare testnet for the Undo web app (FREE: no inference call).
// 1) Pin the REAL attested NEAR AI model key on the dev v1 contract (council = S8 DAO, one proposal).
// 2) Create a faucet account for demo accounts (key -> ../.env as NEAR_UNDO_FAUCET_*).
//   node app_setup.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KeyPair, actions, teraToGas } from "near-api-js";
import { AttestationClient, verifyModelAttestation } from "@nearai/inference-sdk/node";
import { account as main, provider, sleep, EXPLORER } from "./lib.mjs";
import { MODEL, PROMPT, sha256hex } from "./s26_lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, "..", ".env");
const UNDO = process.env.NEAR_UNDO_V1_CONTRACT_ID;
const DAO = "nhspike-mvp6a0dx.sputnikv2.testnet";
if (!UNDO) { console.log("NEAR_UNDO_V1_CONTRACT_ID missing"); process.exit(1); }

// 1) Real model key (attestation verified off-chain, free)
const att = new AttestationClient({ apiKey: process.env.NEAR_AI_API_KEY });
const fetched = await att.fetchModelAttestations({ model: MODEL, signingAlgo: "ed25519" });
const verified = [];
for (const a of fetched.attestations) { try { verified.push(await verifyModelAttestation({ attestation: a, clientBinding: fetched.clientBinding })); } catch {} }
const modelPub = verified.find((v) => v.signingPublicKey)?.signingPublicKey?.replace(/^0x/, "");
if (!modelPub) { console.log("no verified model key"); process.exit(1); }
console.log("attested model key:", modelPub);

const cfg = await provider.callFunction({ contractId: UNDO, method: "get_config", args: {} });
if (cfg.court.signer === modelPub && cfg.court.prompt_sha256 === sha256hex(PROMPT)) {
  console.log("dev contract already pinned to the real model + procedure");
} else {
  const policy = await provider.callFunction({ contractId: DAO, method: "get_policy", args: {} });
  const fn = (method, args) => ({ method_name: method, args: Buffer.from(JSON.stringify(args)).toString("base64"), deposit: "0", gas: teraToGas("50").toString() });
  const kind = { FunctionCall: { receiver_id: UNDO, actions: [fn("register_tee_signer", { model_id: MODEL, signer_pk_hex: modelPub }), fn("register_procedure", { prompt_sha256_hex: sha256hex(PROMPT), max_tokens: 800 })] } };
  const prop = await main.signAndSendTransaction({ receiverId: DAO, actions: [actions.functionCall("add_proposal", { proposal: { description: "Undo dev: pin the real attested NEAR AI model key", kind } }, teraToGas("100"), BigInt(policy.proposal_bond))] });
  const id = Number(Buffer.from(prop.status.SuccessValue, "base64").toString());
  const vote = await main.signAndSendTransaction({ receiverId: DAO, actions: [actions.functionCall("act_proposal", { id, action: "VoteApprove", proposal: kind }, teraToGas("250"), 0n)] });
  console.log("DAO vote:", EXPLORER + vote.transaction.hash);
  await sleep(2000);
  const after = await provider.callFunction({ contractId: UNDO, method: "get_config", args: {} });
  console.log("pinned now:", after.court.signer === modelPub ? "real model ✅" : "NOT pinned ❌", "| procedure", after.court.prompt_sha256 === sha256hex(PROMPT) ? "✅" : "❌");
}

// 2) Faucet account
if (process.env.NEAR_UNDO_FAUCET_ID) {
  const f = await provider.viewAccount({ accountId: process.env.NEAR_UNDO_FAUCET_ID });
  console.log("faucet exists:", process.env.NEAR_UNDO_FAUCET_ID, Number(BigInt(f.amount) / 10n ** 21n) / 1000, "NEAR");
} else {
  const kp = KeyPair.fromRandom("ed25519");
  const id = `undo-faucet-${Date.now().toString(36)}.testnet`;
  const res = await fetch("https://helper.nearprotocol.com/account", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }),
  });
  console.log("faucet via helper -> HTTP", res.status);
  if (res.ok) {
    fs.appendFileSync(envPath, `NEAR_UNDO_FAUCET_ID=${id}\nNEAR_UNDO_FAUCET_PRIVATE_KEY=${kp.toString()}\n`);
    console.log("faucet created:", id);
  }
}
