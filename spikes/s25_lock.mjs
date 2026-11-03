// S25 — lock a deployed Undo v1 contract (J5): deploy, delete its only full-access key, then prove
// (1) no keys remain, (2) the on-chain code hash == sha256 of our local wasm, (3) the contract still
// works for users, (4) council-only functions still refuse others, (5) nobody can redeploy.
// Testnet throwaway account; the key is kept in memory only and deleted on-chain.
//   node s25_lock.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Account, KeyPair, actions, teraToGas, nearToYocto } from "near-api-js";
import { account as main, provider, json, sleep, EXPLORER } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.join(here, "..", "undo", "contracts", "wasm", "undo_token.wasm");
const outPath = path.join(here, "out", "s25_lock.json");
const DAO = "nhspike-mvp6a0dx.sputnikv2.testnet";
const out = { rows: [] };
const check = (label, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`); out.rows.push({ label, pass: !!ok, detail }); };

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(buf) {
  let n = BigInt("0x" + Buffer.from(buf).toString("hex"));
  let s = "";
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of buf) { if (b === 0) s = "1" + s; else break; }
  return s;
}

const wasm = fs.readFileSync(wasmPath);
const localHash = base58(crypto.createHash("sha256").update(wasm).digest());
out.wasm = { bytes: wasm.length, sha256_base58: localHash };
console.log("local wasm", wasm.length, "B, sha256 (base58)", localHash);

// 1) Fresh account: a sub-account of the v1 contract account (avoids the faucet rate limit)
const parent = new Account(process.env.NEAR_UNDO_V1_CONTRACT_ID, provider, process.env.NEAR_UNDO_V1_CONTRACT_PRIVATE_KEY);
const kp = KeyPair.fromRandom("ed25519");
const prefix = `locked${Date.now().toString(36)}`;
const id = `${prefix}.${parent.accountId}`;
await parent.createSubAccount({ accountOrPrefix: prefix, publicKey: kp.getPublicKey(), nearToTransfer: nearToYocto("3.4") });
const locked = new Account(id, provider, kp.toString());
out.contract = id;
console.log("account", id);

// 2) Deploy + init, then delete the only full-access key
const dep = await locked.signAndSendTransaction({
  receiverId: id,
  actions: [
    actions.deployContract(new Uint8Array(wasm)),
    actions.functionCall("new", {
      underlying: "usdc.fakes.testnet", council: DAO, window_sec: 3600, contest_window_sec: 1800, evidence_window_sec: 600,
      dispute_timeout_sec: 86400, recovery_delay_sec: 3600, bond: nearToYocto("0.01").toString(), storage_fee: nearToYocto("0.005").toString(),
    }, teraToGas("50"), 0n),
  ],
});
console.log("deploy + new:", EXPLORER + dep.transaction.hash);
const del = await locked.signAndSendTransaction({ receiverId: id, actions: [actions.deleteKey(kp.getPublicKey())] });
out.deleteKeyTx = EXPLORER + del.transaction.hash;
console.log("delete key:", out.deleteKeyTx);
await sleep(2000);

// 3) Proofs
const keys = await provider.viewAccessKeyList({ accountId: id });
check("no access keys remain on the contract account", (keys.keys ?? []).length === 0, `${(keys.keys ?? []).length} keys`);
const acct = await provider.viewAccount({ accountId: id });
check("on-chain code hash == sha256(local wasm)", acct.code_hash === localHash, acct.code_hash);
const meta = await provider.callFunction({ contractId: id, method: "contract_source_metadata", args: {} });
out.nep330 = meta;
check("NEP-330 source metadata is exposed", meta?.standards?.some((s) => s.standard === "nep330"), json(meta.standards));

let redeploy;
try { await locked.signAndSendTransaction({ receiverId: id, actions: [actions.deployContract(new Uint8Array(wasm))] }); redeploy = "succeeded (BAD)"; }
catch (e) { redeploy = String(e?.message ?? e).slice(0, 140); }
check("redeploy with the deleted key is impossible", !redeploy.startsWith("succeeded"), redeploy);

async function tryCall(who, method, args) {
  try {
    const r = await who.signAndSendTransaction({ receiverId: id, actions: [actions.functionCall(method, args, teraToGas("30"), 0n)] });
    return r?.status?.Failure ? JSON.stringify(r.status.Failure).slice(0, 160) : "ok";
  } catch (e) { return String(e?.message ?? e).slice(0, 160); }
}
check("users can still use the locked contract (set_recovery)", (await tryCall(main, "set_recovery", { recovery_id: "nh-v1undo-mvz2j3bw.testnet" })) === "ok");
const notCouncil = await tryCall(main, "register_procedure", { prompt_sha256_hex: "00".repeat(32), max_tokens: 1 });
check("council-only functions still refuse others", notCouncil.includes("only the council"), notCouncil.replace(/.*panicked: /, ""));

out.summary = `${out.rows.filter((r) => r.pass).length}/${out.rows.length} pass`;
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, json(out) + "\n");
console.log(`\n${out.summary} -> ${path.relative(process.cwd(), outPath)}`);
