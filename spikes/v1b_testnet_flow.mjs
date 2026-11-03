// v1b — end-to-end scenario for undo-token v1 on testnet (FREE: fake court model key, no NEAR AI call).
//   node v1b_testnet_flow.mjs
// Creates a fresh contract account (key -> ../.env as NEAR_UNDO_V1_CONTRACT_*) and throwaway role
// accounts (keys kept in memory only). Council = the S8 Sputnik DAO (our main account votes).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Account, KeyPair, actions, teraToGas, nearToYocto, yoctoToNear } from "near-api-js";
import { account as main, accountId as mainId, provider, json, sleep, EXPLORER } from "./lib.mjs";
import {
  MODEL, MAX_TOKENS, PROMPT, BUYER_EVIDENCE, SELLER_EVIDENCE, sha256hex, seed, encryptTo, caseFileV1, systemMessage,
  buildRequest, fakeModel, fakeRespond, newClient,
} from "./s26_lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, "..", ".env");
const wasmPath = path.join(here, "..", "undo", "contracts", "wasm", "undo_token.wasm");
const outPath = path.join(here, "out", "v1_flow.json");
const USDC = "usdc.fakes.testnet";
const DAO = "nhspike-mvp6a0dx.sputnikv2.testnet";
const CFG = { window_sec: 90, contest_window_sec: 40, evidence_window_sec: 30, dispute_timeout_sec: 600, recovery_delay_sec: 60 };
const BOND = nearToYocto("0.01");
const FEE = nearToYocto("0.005");
const USD = (n) => String(Math.round(n * 1e6));
const out = { startedAt: new Date().toISOString(), cfg: CFG, rows: [] };
const save = () => { fs.mkdirSync(path.dirname(outPath), { recursive: true }); fs.writeFileSync(outPath, json(out) + "\n"); };

function upsertEnv(name, value) {
  const lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8").split(/\r?\n/) : [];
  const i = lines.findIndex((l) => l.startsWith(name + "="));
  if (i >= 0) lines[i] = `${name}=${value}`; else lines.push(`${name}=${value}`);
  fs.writeFileSync(envPath, lines.filter((l, j) => l !== "" || j < lines.length - 1).join("\n") + "\n");
}

async function newAccount(role) {
  const kp = KeyPair.fromRandom("ed25519");
  const id = `nh-v1${role}-${Date.now().toString(36)}.testnet`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://helper.nearprotocol.com/account", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }),
    });
    if (res.ok) break;
    if (attempt === 2) throw new Error(`helper failed for ${role}: ${res.status}`);
    await sleep(3000);
  }
  for (let i = 0; i < 15; i++) { try { await provider.viewAccount({ accountId: id }); break; } catch { await sleep(2000); } }
  return { id, key: kp.toString(), acct: new Account(id, provider, kp.toString()) };
}

const sumGas = (r) => (r?.transaction_outcome?.outcome?.gas_burnt ?? 0) + (r?.receipts_outcome ?? []).reduce((a, o) => a + (o.outcome?.gas_burnt ?? 0), 0);
let UNDO;
async function call(label, who, receiver, method, args, { deposit = 0n, gas = "100", expectFail = false, quiet = false } = {}) {
  let r, err;
  try { r = await who.signAndSendTransaction({ receiverId: receiver, actions: [actions.functionCall(method, args, teraToGas(gas), deposit)] }); }
  catch (e) { err = String(e?.message ?? e).slice(0, 240); }
  const failure = r?.status?.Failure ? JSON.stringify(r.status.Failure).slice(0, 240) : err;
  let value;
  if (r?.status?.SuccessValue) { const s = Buffer.from(r.status.SuccessValue, "base64").toString(); try { value = JSON.parse(s); } catch { value = s; } }
  const row = { label, pass: expectFail ? !!failure : !failure, tgas: r ? +(sumGas(r) / 1e12).toFixed(2) : null, tx: r ? EXPLORER + r.transaction.hash : null, failure };
  if (!quiet || !row.pass) console.log(`${row.pass ? "PASS" : "FAIL"} ${label}${row.tgas != null ? ` (${row.tgas} Tgas)` : ""}${failure ? ` -> ${failure.replace(/.*panicked: /, "").slice(0, 110)}` : ""}`);
  if (!quiet) out.rows.push(row);
  return value;
}
const view = (method, args) => provider.callFunction({ contractId: UNDO, method, args });
const check = (label, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`); out.rows.push({ label, pass: !!ok, detail }); };

async function daoExecute(description, fnActions) {
  const policy = await provider.callFunction({ contractId: DAO, method: "get_policy", args: {} });
  const kind = { FunctionCall: { receiver_id: UNDO, actions: fnActions.map(({ method, args }) => ({ method_name: method, args: Buffer.from(JSON.stringify(args)).toString("base64"), deposit: "0", gas: teraToGas("50").toString() })) } };
  const id = await call(`DAO add_proposal: ${description}`, main, DAO, "add_proposal", { proposal: { description, kind } }, { deposit: BigInt(policy.proposal_bond), quiet: true });
  await call(`DAO vote: ${description}`, main, DAO, "act_proposal", { id: Number(id), action: "VoteApprove", proposal: kind }, { gas: "250" });
  await sleep(2000);
}

// ---------- 0) accounts + deploy ----------
const bal = await provider.viewAccount({ accountId: mainId });
console.log("main account", mainId, yoctoToNear(bal.amount, 3), "NEAR");
// Reuse the saved contract account if nothing is deployed on it yet; otherwise make a new one.
let contract;
if (process.env.NEAR_UNDO_V1_CONTRACT_ID) {
  const st = await provider.viewAccount({ accountId: process.env.NEAR_UNDO_V1_CONTRACT_ID }).catch(() => null);
  if (st && st.code_hash === "11111111111111111111111111111111") {
    contract = { id: process.env.NEAR_UNDO_V1_CONTRACT_ID, key: process.env.NEAR_UNDO_V1_CONTRACT_PRIVATE_KEY };
    contract.acct = new Account(contract.id, provider, contract.key);
  }
}
if (!contract) {
  contract = await newAccount("undo");
  upsertEnv("NEAR_UNDO_V1_CONTRACT_ID", contract.id);
  upsertEnv("NEAR_UNDO_V1_CONTRACT_PRIVATE_KEY", contract.key);
}
UNDO = contract.id;
out.contract = UNDO;
// Role accounts = sub-accounts of the contract account (no faucet rate limit). Keys stay in memory.
const roles = {};
for (const r of ["alice", "alicehp", "thief", "buyer", "buyerhp", "seller", "shop"]) {
  const kp = KeyPair.fromRandom("ed25519");
  await contract.acct.createSubAccount({ accountOrPrefix: r, publicKey: kp.getPublicKey(), nearToTransfer: nearToYocto("0.4") });
  const id = `${r}.${UNDO}`;
  roles[r] = { id, key: kp.toString(), acct: new Account(id, provider, kp.toString()) };
}
out.accounts = Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, v.id]));
console.log("contract", UNDO, "| roles", Object.values(out.accounts).join(", "));

const dep = await contract.acct.signAndSendTransaction({
  receiverId: UNDO,
  actions: [
    actions.deployContract(new Uint8Array(fs.readFileSync(wasmPath))),
    actions.functionCall("new", { underlying: USDC, council: DAO, ...CFG, bond: BOND.toString(), storage_fee: FEE.toString() }, teraToGas("50"), 0n),
  ],
});
console.log("deploy + new:", EXPLORER + dep.transaction.hash);
for (const who of [UNDO, roles.alice.id, roles.buyer.id, roles.shop.id]) {
  await call(`USDC register ${who}`, main, USDC, "storage_deposit", { account_id: who, registration_only: true }, { deposit: nearToYocto("0.00125"), quiet: true });
}

// Council pins the court: (fake) TEE key + procedure, in one DAO proposal.
const model = fakeModel(seed("v1 testnet model"));
await daoExecute("Undo v1: pin court TEE key + procedure", [
  { method: "register_tee_signer", args: { model_id: MODEL, signer_pk_hex: model.pubHex } },
  { method: "register_procedure", args: { prompt_sha256_hex: sha256hex(PROMPT), max_tokens: MAX_TOKENS } },
]);
const cfg = await view("get_config", {});
check("council pinned the court key and procedure", cfg.court.signer === model.pubHex && cfg.court.prompt_sha256 === sha256hex(PROMPT));

// ---------- A) stolen key → panic (function-call key) → finalize, no vote ----------
console.log("\n--- Scenario A: stolen key ---");
const { alice, alicehp, thief } = roles;
await call("alice sets recovery account (instant: empty account)", alice.acct, UNDO, "set_recovery", { recovery_id: alicehp.id });
await call("mint 1000 USDC to alice", main, USDC, "mint", { account_id: alice.id, amount: USD(1000) }, { quiet: true });
await call("alice wraps 1000 USDC -> rUSDC", alice.acct, USDC, "ft_transfer_call", { receiver_id: UNDO, amount: USD(1000), msg: "" }, { deposit: 1n });
const theftId = await call("THIEF (alice's key) sends 900 rUSDC to itself", alice.acct, UNDO, "transfer", { receiver_id: thief.id, amount: USD(900) }, { deposit: FEE });
await call("ATTACK thief tries to unwrap the pending 900", thief.acct, UNDO, "unwrap", { amount: USD(900) }, { deposit: FEE, expectFail: true });
await call("ATTACK thief swaps alice's recovery account", alice.acct, UNDO, "set_recovery", { recovery_id: thief.id });
check("recovery swap is only scheduled, not active", (await view("get_account", { account_id: alice.id })).recovery === alicehp.id);
// The recovery account adds a key that can ONLY call panic (an auto-panic bot could hold it).
const panicKey = KeyPair.fromRandom("ed25519");
await alicehp.acct.signAndSendTransaction({ receiverId: alicehp.id, actions: [actions.addFunctionCallAccessKey(panicKey.getPublicKey(), UNDO, ["panic"], nearToYocto("0.25"))] });
const panicBot = new Account(alicehp.id, provider, panicKey.toString());
const p = await call("PANIC via a function-call key limited to `panic`", panicBot, UNDO, "panic", { account_id: alice.id }, { gas: "150" });
const sweepId = p?.sweep;
check("theft frozen and remaining 100 swept (frozen)", p?.frozen?.length === 1 && p?.swept === USD(100), `frozen ${json(p?.frozen)}, swept ${p?.swept}`);
await call("ATTACK locked account sends again", alice.acct, UNDO, "transfer", { receiver_id: thief.id, amount: USD(1) }, { deposit: FEE, expectFail: true });
await call("ATTACK finalize before the contest window ends", main, UNDO, "finalize", { transfer_id: theftId }, { expectFail: true });
console.log(`waiting ${CFG.contest_window_sec + 5}s for the contest window…`);
await sleep((CFG.contest_window_sec + 5) * 1000);
await call("finalize theft (anyone, no vote)", main, UNDO, "finalize", { transfer_id: theftId });
await call("finalize sweep", main, UNDO, "finalize", { transfer_id: sweepId });
const hp = await view("balance_of", { account_id: alicehp.id });
const th = await view("balance_of", { account_id: thief.id });
check("alice's recovery account holds all 1000 rUSDC; thief 0", hp.available === USD(1000) && th.available === "0" && th.pending_in === "0", `hp ${hp.available}, thief ${th.available}`);
save();

// ---------- B) scam → report → court level 2 → council ----------
console.log("\n--- Scenario B: fake seller, private court ---");
const { buyer, buyerhp, seller } = roles;
await call("buyer sets recovery account", buyer.acct, UNDO, "set_recovery", { recovery_id: buyerhp.id });
await call("mint 200 USDC to buyer", main, USDC, "mint", { account_id: buyer.id, amount: USD(200) }, { quiet: true });
await call("buyer wraps 200", buyer.acct, USDC, "ft_transfer_call", { receiver_id: UNDO, amount: USD(200), msg: "" }, { deposit: 1n });
const payId = await call("buyer pays the 'seller' 150 rUSDC", buyer.acct, UNDO, "transfer", { receiver_id: seller.id, amount: USD(150), memo: "HP bekas" }, { deposit: FEE });
await call("ATTACK an outsider reports the payment", thief.acct, UNDO, "report", { transfer_id: payId, reason: "griefing" }, { deposit: BOND, expectFail: true });
await call("buyer reports the payment (bond 0.01 NEAR)", buyer.acct, UNDO, "report", { transfer_id: payId, reason: "penjual menghilang" }, { deposit: BOND });
const nonce = (await view("get_transfer", { transfer_id: payId })).dispute.case_nonce;
const evBuyer = encryptTo(model.pubHex, BUYER_EVIDENCE).envelope;
const evSeller = encryptTo(model.pubHex, SELLER_EVIDENCE).envelope;
await call("buyer commits encrypted evidence", buyer.acct, UNDO, "commit_evidence", { transfer_id: payId, envelope_sha256_hex: sha256hex(evBuyer) });
await call("seller commits encrypted evidence", seller.acct, UNDO, "commit_evidence", { transfer_id: payId, envelope_sha256_hex: sha256hex(evSeller) });
// Court server: fresh client key, canonical request; the (fake) TEE model answers and signs.
const client = newClient();
const cf = caseFileV1({ transferId: String(payId), jenis: "laporan", amount: USD(150), nonce, order: ["pengirim", "penerima"] });
const sys = encryptTo(model.pubHex, systemMessage(PROMPT, cf));
const request = buildRequest({ systemEnvelope: sys.envelope, evidenceEnvelopes: [evBuyer, evSeller] });
const verdict = { transfer_id: String(payId), case_nonce: nonce, rekomendasi: "kembalikan", confidence: 92, curiga_injeksi: true, alasan_publik: "Resi bertanggal sebelum transaksi." };
const r = fakeRespond({ model, request, clientPubHex: client.pubHex, verdict, reasoning: "rahasia", label: `v1-${payId}` });
const postArgs = { transfer_id: payId, signed_text: r.signedText, signature_hex: r.signature, system_envelope: sys.envelope, system_eph_secret_hex: sys.ephSecretHex, evidence_envelopes: [evBuyer, evSeller], response_body: r.response, verdict_key_hex: r.verdictKeyHex };
await call("ATTACK court server drops the seller's evidence", main, UNDO, "post_recommendation", { ...postArgs, evidence_envelopes: [evBuyer] }, { gas: "300", expectFail: true });
const rec = await call("post_recommendation (anyone; procedure proven on-chain)", main, UNDO, "post_recommendation", postArgs, { gas: "300" });
const disputed = await view("get_transfer", { transfer_id: payId });
check("recommendation stored, money not moved by the AI", rec?.rekomendasi === "kembalikan" && disputed.status === "Disputed");
await daoExecute(`Undo v1: resolve #${payId} (reverse, per TEE recommendation)`, [{ method: "resolve", args: { transfer_id: payId, reverse: true, reason: "Rekomendasi TEE: resi palsu" } }]);
const bhp = await view("balance_of", { account_id: buyerhp.id });
check("council reversed: 150 rUSDC at the buyer's recovery account", bhp.available === USD(150), bhp.available);
check("the seller's lost dispute is counted", (await view("get_reputation", { account_id: seller.id })) === 1);
save();

// ---------- C) honest payment: send_usdc to a non-Undo shop + "barang diterima" ----------
console.log("\n--- Scenario C: plain USDC to a shop, released early ---");
const { shop } = roles;
const exitId = await call("buyer pays a shop 20 USDC via send_usdc", buyer.acct, UNDO, "send_usdc", { receiver_id: shop.id, amount: USD(20) }, { deposit: FEE });
await call("ATTACK buyer's main key releases early", buyer.acct, UNDO, "release", { transfer_id: exitId }, { expectFail: true });
await call("ATTACK withdraw inside the window", main, UNDO, "withdraw", { transfer_id: exitId }, { expectFail: true });
await call("'Barang diterima' from the buyer's recovery account", buyerhp.acct, UNDO, "release", { transfer_id: exitId });
await call("withdraw (anyone): USDC goes to the shop", main, UNDO, "withdraw", { transfer_id: exitId }, { gas: "100" });
await sleep(2000);
const shopUsdc = await provider.callFunction({ contractId: USDC, method: "ft_balance_of", args: { account_id: shop.id } });
check("the shop received 20 plain USDC", shopUsdc === USD(20), shopUsdc);

// ---------- J6: reserve ----------
const supply = (await view("get_reserve", {})).total_supply;
const held = await provider.callFunction({ contractId: USDC, method: "ft_balance_of", args: { account_id: UNDO } });
check("J6: rUSDC supply == USDC held by the contract", supply === held, `${supply} vs ${held}`);

out.summary = `${out.rows.filter((x) => x.pass).length}/${out.rows.length} pass`;
save();
console.log(`\n${out.summary} -> ${path.relative(process.cwd(), outPath)}`);
