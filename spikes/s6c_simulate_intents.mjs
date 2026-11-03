// S6c — NEAR Intents without funds: sign intents locally / via Chain Signatures MPC,
// and let the MAINNET verifier (intents.near) check them with simulate_intents (a view call: free, no state change).
import crypto from "node:crypto";
import bs58 from "bs58";
import { JsonRpcProvider, KeyPair, teraToGas } from "near-api-js";
import { keccak256, toBytes, recoverMessageAddress } from "viem";
import { account as testnetAccount, accountId as testnetId, json } from "./lib.mjs";

const VERIFIER = "intents.near";
const mainnet = new JsonRpcProvider({ url: "https://rpc.mainnet.fastnear.com" });
const results = [];

async function simulate(label, signed, expect) {
  try {
    const r = await mainnet.callFunction({ contractId: VERIFIER, method: "simulate_intents", args: { signed } });
    const outcome = "accepted";
    results.push({ label, expect, outcome, pass: expect === outcome });
    console.log(`\n[${expect === outcome ? "PASS" : "FAIL"}] ${label}: ${outcome}`);
    console.log("   ", json({ intents_executed: r.intents_executed, state: r.state, logs: r.logs?.map((l) => l.slice(0, 220)) }).slice(0, 1200));
    return r;
  } catch (e) {
    const msg = (e?.message ?? String(e)).replace(/\s+/g, " ").slice(0, 300);
    const outcome = "rejected";
    results.push({ label, expect, outcome, pass: expect === outcome, error: msg });
    console.log(`\n[${expect === outcome ? "PASS" : "FAIL"}] ${label}: ${outcome} -> ${msg}`);
  }
}

// 0) Current salt from the contract
const probe = await mainnet.callFunction({ contractId: VERIFIER, method: "simulate_intents", args: { signed: [] } });
const salt = Buffer.from(probe.state.current_salt, "hex");
console.log("verifier state:", json(probe.state));

function versionedNonce(deadlineMs) {
  const b = Buffer.alloc(32);
  Buffer.from("5628f6c6", "hex").copy(b, 0);
  b[4] = 0; // version V1 index
  salt.copy(b, 5);
  b.writeBigInt64LE(BigInt(deadlineMs) * 1_000_000n, 9);
  crypto.randomBytes(15).copy(b, 17);
  return b;
}
const deadlineMs = Date.now() + 10 * 60 * 1000;
const deadline = new Date(deadlineMs).toISOString();

// ---------- NEP-413 with a fresh ed25519 key (implicit account, never funded) ----------
const kp = KeyPair.fromRandom("ed25519");
const pk = kp.getPublicKey();
const implicitId = Buffer.from(pk.data).toString("hex");
console.log("\nfresh implicit signer:", implicitId);

function borshString(s) { const d = Buffer.from(s, "utf8"); const l = Buffer.alloc(4); l.writeUInt32LE(d.length); return Buffer.concat([l, d]); }
function nep413Sign(message, nonce, recipient) {
  const tag = Buffer.alloc(4); tag.writeUInt32LE(2 ** 31 + 413);
  const payload = Buffer.concat([tag, borshString(message), nonce, borshString(recipient), Buffer.from([0])]); // callback_url: None
  const hash = crypto.createHash("sha256").update(payload).digest();
  return kp.sign(hash).signature;
}
function nep413(intents, { tamper = false } = {}) {
  const nonce = versionedNonce(deadlineMs);
  const message = JSON.stringify({ deadline, intents, signer_id: implicitId });
  const sig = Buffer.from(nep413Sign(message, nonce, VERIFIER));
  if (tamper) sig[0] ^= 0xff;
  return {
    standard: "nep413",
    payload: { recipient: VERIFIER, nonce: nonce.toString("base64"), message },
    public_key: pk.toString(),
    signature: "ed25519:" + bs58.encode(sig),
  };
}

await simulate("NEP-413, empty intents, fresh implicit account", [nep413([])], "accepted");
await simulate("NEP-413, transfer 1 yocto wNEAR from empty account", [nep413([{ intent: "transfer", receiver_id: "intents.near", tokens: { "nep141:wrap.near": "1" } }])], "rejected");
await simulate("NEP-413, tampered signature", [nep413([], { tamper: true })], "rejected");

// ---------- ERC-191 signed by NEAR Chain Signatures (MPC on testnet, path nh-spike-evm-1) ----------
const evmAddr = "0x2a01699f048133dce1035ddfbca7f423f39d566b";
const erc191Payload = JSON.stringify({
  signer_id: evmAddr, verifying_contract: VERIFIER, deadline,
  nonce: versionedNonce(deadlineMs).toString("base64"), intents: [],
});
const prefixed = Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${Buffer.byteLength(erc191Payload)}`), Buffer.from(erc191Payload)]);
const digest = toBytes(keccak256(prefixed));
const t0 = Date.now();
const mpc = await testnetAccount.callFunction({
  contractId: "v1.signer-prod.testnet",
  methodName: "sign",
  args: { request: { payload_v2: { Ecdsa: Buffer.from(digest).toString("hex") }, path: "nh-spike-evm-1", domain_id: 0 } },
  gas: teraToGas("300"),
  deposit: 1n,
});
console.log(`\nMPC (testnet, signer ${testnetId}) signed ERC-191 digest in ${Date.now() - t0} ms`);
const r = Buffer.from(mpc.big_r.affine_point.slice(2), "hex"); // drop 02/03 prefix -> x coordinate
const s = Buffer.from(mpc.s.scalar, "hex");
const v = Buffer.from([mpc.recovery_id]); // verifier expects v in {0,1}
const rsv = Buffer.concat([r, s, v]);
const recovered = await recoverMessageAddress({ message: erc191Payload, signature: `0x${Buffer.concat([r, s, Buffer.from([mpc.recovery_id + 27])]).toString("hex")}` });
console.log("local EIP-191 recover:", recovered.toLowerCase(), recovered.toLowerCase() === evmAddr ? "== derived address ✅" : "MISMATCH ❌");
await simulate("ERC-191 by Chain Signatures MPC, empty intents", [{ standard: "erc191", payload: erc191Payload, signature: "secp256k1:" + bs58.encode(rsv) }], "accepted");

console.log("\n=== S6c summary ===");
for (const x of results) console.log(`${x.pass ? "PASS" : "FAIL"} | ${x.label} | expected ${x.expect} | got ${x.outcome}${x.error ? " | " + x.error.slice(0, 160) : ""}`);
