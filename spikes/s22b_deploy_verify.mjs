// S22b — deploy the S22 verifier (decrypt build) to a fresh testnet account and measure real gas.
// The new account's key goes to ../.env only (never printed). Re-running redeploys the wasm.
//   node s22b_deploy_verify.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Account, KeyPair, actions, teraToGas } from "near-api-js";
import { account as main, provider, json, sleep, EXPLORER } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, "..", ".env");
const wasmPath = path.join(here, "..", "undo", "contracts", "wasm", "s22_verifier.wasm");
const vectors = JSON.parse(fs.readFileSync(path.join(here, "..", "undo", "contracts", "s22-verifier", "vectors.json"), "utf8"));
const outPath = path.join(here, "out", "s22_results.json");

// 1) Account: reuse from .env or create a new one via the testnet helper
let id = process.env.NEAR_S22_CONTRACT_ID;
let key = process.env.NEAR_S22_CONTRACT_PRIVATE_KEY;
let fresh = false;
if (!id) {
  const kp = KeyPair.fromRandom("ed25519");
  id = `nh-s22-${Date.now().toString(36)}.testnet`;
  const res = await fetch("https://helper.nearprotocol.com/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }),
  });
  console.log(`helper -> HTTP ${res.status}`);
  if (!res.ok) process.exit(1);
  key = kp.toString();
  fs.appendFileSync(envPath, `NEAR_S22_CONTRACT_ID=${id}\nNEAR_S22_CONTRACT_PRIVATE_KEY=${key}\n`);
  console.log("saved", id, "to .env");
  fresh = true;
  for (let i = 0; i < 15; i++) {
    try { await provider.viewAccount({ accountId: id }); break; } catch { await sleep(2000); }
  }
}
const contract = new Account(id, provider, key);

// 2) Deploy (+ init on first run)
const wasm = fs.readFileSync(wasmPath);
const deployActions = [actions.deployContract(new Uint8Array(wasm))];
if (fresh) deployActions.push(actions.functionCall("new", { signer_pk_hex: vectors.signer_pk_hex }, teraToGas("30"), 0n));
const dep = await contract.signAndSendTransaction({ receiverId: id, actions: deployActions });
console.log("deploy:", EXPLORER + dep.transaction.hash);
console.log("pinned signer:", await provider.callFunction({ contractId: id, method: "get_signer", args: {} }));

// 3) Calls, each as a real transaction so the gas is measured
const sumGas = (r) =>
  (r?.transaction_outcome?.outcome?.gas_burnt ?? 0) + (r?.receipts_outcome ?? []).reduce((a, o) => a + (o.outcome?.gas_burnt ?? 0), 0);
const sumBurnt = (r) =>
  BigInt(r?.transaction_outcome?.outcome?.tokens_burnt ?? 0) +
  (r?.receipts_outcome ?? []).reduce((a, o) => a + BigInt(o.outcome?.tokens_burnt ?? 0), 0n);

async function call(label, method, args, expectFail = false) {
  const argBytes = Buffer.byteLength(JSON.stringify(args));
  let r, err;
  try {
    r = await main.signAndSendTransaction({ receiverId: id, actions: [actions.functionCall(method, args, teraToGas("300"), 0n)] });
  } catch (e) {
    err = String(e?.message ?? e).slice(0, 200);
  }
  const failure = r?.status?.Failure ? JSON.stringify(r.status.Failure).slice(0, 200) : err;
  const ok = !failure;
  const value = r?.status?.SuccessValue ? Buffer.from(r.status.SuccessValue, "base64").toString() : undefined;
  const row = {
    label,
    method,
    pass: expectFail ? !ok : ok,
    expectFail,
    argBytes,
    tgas: r ? +(sumGas(r) / 1e12).toFixed(3) : null,
    nearBurnt: r ? Number(sumBurnt(r)) / 1e24 : null,
    tx: r ? EXPLORER + r.transaction.hash : null,
    value: value?.slice(0, 120),
    failure,
  };
  console.log(json(row));
  return { ...row, full: value };
}

const pt = vectors.provider_tee;
const gw = vectors.gateway;
const big = vectors.big;
const v = (c, withReq) => ({ signed_text: c.signed_text, signature_hex: c.signature_hex, response_body: c.response_body, request_body: withReq ? c.request_body : null });
const o = (c, k = c) => ({ signed_text: c.signed_text, signature_hex: c.signature_hex, response_body: c.response_body, content_hex: c.content_hex, key_hex: k.key_hex });

const rows = [
  await call("verify provider_tee (response only)", "verify", v(pt, false)),
  await call("verify provider_tee + request hash", "verify", v(pt, true)),
  await call("verify gateway + request hash", "verify", v(gw, true)),
  await call("verify big (16 KB request, 12 KB response)", "verify", v(big, true)),
  await call("open provider_tee (verify + decrypt)", "open", o(pt)),
  await call("open big (6 KB verdict)", "open", o(big)),
  await call("NEG edited response", "verify", { ...v(pt, false), response_body: pt.response_body.replace("chat.completion", "chat.completioN") }, true),
  await call("NEG wrong key", "open", o(pt, gw), true),
];

const opened = rows.find((r) => r.label.startsWith("open provider_tee"))?.full;
const decryptedOk = opened ? JSON.parse(opened) === pt.plaintext : false;
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const saved = rows.map(({ full, ...r }) => r);
fs.writeFileSync(outPath, json({ contract: id, wasmBytes: wasm.length, decryptedMatchesPlaintext: decryptedOk, rows: saved }) + "\n");
console.log(`\n${rows.filter((r) => r.pass).length}/${rows.length} pass · decrypted verdict matches: ${decryptedOk} · wasm ${wasm.length} B`);
console.log("results ->", path.relative(process.cwd(), outPath));
