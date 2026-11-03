// S21b — FREE (testnet only): check the real NEAR AI response from S21a inside the S22 contract.
// Deploys a fresh S22 verifier instance whose pinned signer is the attested NEAR AI model key,
// then verifies the real signature and opens the real encrypted verdict on-chain.
//   node s21b_verify_onchain.mjs      (needs out/s21_raw.json from s21a)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Account, KeyPair, actions, teraToGas } from "near-api-js";
import { account as main, provider, json, sleep, EXPLORER } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, "..", ".env");
const wasmPath = path.join(here, "..", "undo", "contracts", "wasm", "s22_verifier.wasm");
const raw = JSON.parse(fs.readFileSync(path.join(here, "out", "s21_raw.json"), "utf8"));
const outPath = path.join(here, "out", "s21_onchain.json");
const signerPk = raw.signature.signer.signingAddress.replace(/^0x/, "");
const content = raw.opened.find((o) => o.path.endsWith(".content"));
const reasoning = raw.opened.find((o) => o.path.endsWith(".reasoning_content"));

// 1) Account: reuse from .env or create via the testnet helper (key -> .env only)
let id = process.env.NEAR_S21_CONTRACT_ID;
let key = process.env.NEAR_S21_CONTRACT_PRIVATE_KEY;
let fresh = false;
if (!id) {
  const kp = KeyPair.fromRandom("ed25519");
  id = `nh-s21-${Date.now().toString(36)}.testnet`;
  const res = await fetch("https://helper.nearprotocol.com/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }),
  });
  console.log(`helper -> HTTP ${res.status}`);
  if (!res.ok) process.exit(1);
  key = kp.toString();
  fs.appendFileSync(envPath, `NEAR_S21_CONTRACT_ID=${id}\nNEAR_S21_CONTRACT_PRIVATE_KEY=${key}\n`);
  console.log("saved", id, "to .env");
  fresh = true;
  for (let i = 0; i < 15; i++) {
    try { await provider.viewAccount({ accountId: id }); break; } catch { await sleep(2000); }
  }
}
const contract = new Account(id, provider, key);

// 2) Deploy + pin the attested NEAR AI model key
const deployActions = [actions.deployContract(new Uint8Array(fs.readFileSync(wasmPath)))];
if (fresh) deployActions.push(actions.functionCall("new", { signer_pk_hex: signerPk }, teraToGas("30"), 0n));
const dep = await contract.signAndSendTransaction({ receiverId: id, actions: deployActions });
console.log("deploy:", EXPLORER + dep.transaction.hash);
const pinned = await provider.callFunction({ contractId: id, method: "get_signer", args: {} });
console.log("pinned signer:", pinned, pinned === signerPk ? "(= attested NEAR AI model key)" : "(MISMATCH)");

const sumGas = (r) =>
  (r?.transaction_outcome?.outcome?.gas_burnt ?? 0) + (r?.receipts_outcome ?? []).reduce((a, o) => a + (o.outcome?.gas_burnt ?? 0), 0);
async function call(label, method, args, expectFail = false) {
  let r, err;
  try {
    r = await main.signAndSendTransaction({ receiverId: id, actions: [actions.functionCall(method, args, teraToGas("300"), 0n)] });
  } catch (e) {
    err = String(e?.message ?? e).slice(0, 200);
  }
  const failure = r?.status?.Failure ? JSON.stringify(r.status.Failure).slice(0, 200) : err;
  const value = r?.status?.SuccessValue ? Buffer.from(r.status.SuccessValue, "base64").toString() : undefined;
  const row = { label, pass: expectFail ? !!failure : !failure, tgas: r ? +(sumGas(r) / 1e12).toFixed(3) : null, tx: r ? EXPLORER + r.transaction.hash : null, failure };
  console.log(json(row));
  return { ...row, value };
}

const base = { signed_text: raw.signature.signedText, signature_hex: raw.signature.signature, response_body: raw.responseBody };
const rows = [
  await call("verify real NEAR AI signature + request hash", "verify", { ...base, request_body: raw.requestBody }),
  await call("open real encrypted verdict (content key)", "open", { ...base, content_hex: content.contentHex, key_hex: content.keyHex }),
  await call("NEG content key cannot open the reasoning", "open", { ...base, content_hex: reasoning.contentHex, key_hex: content.keyHex }, true),
  await call("NEG edited response", "verify", { ...base, response_body: raw.responseBody.replace("chat.completion", "chat.completioN"), request_body: null }, true),
];

const opened = rows[1].value ? JSON.parse(rows[1].value) : undefined;
const verdictMatches = opened === content.plaintext;
const verdict = opened ? JSON.parse(opened) : undefined;
const result = {
  contract: id,
  pinnedSigner: pinned,
  verdictMatchesOffchainDecryption: verdictMatches,
  caseNonceMatches: verdict?.case_nonce === raw.caseNonce,
  verdict,
  rows: rows.map(({ value, ...r }) => r),
};
fs.writeFileSync(outPath, json(result) + "\n");
console.log(`\n${rows.filter((r) => r.pass).length}/${rows.length} pass · verdict on-chain == off-chain: ${verdictMatches} · case_nonce matches: ${result.caseNonceMatches}`);
console.log("results ->", path.relative(process.cwd(), outPath));
