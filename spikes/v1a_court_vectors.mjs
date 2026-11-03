// v1a — court vectors for the undo-token v1 unit tests (FAKE model key, deterministic, free).
// Scenario in the test: transfer #0 of 150 rUSDC, reported by the sender (block random seed = 7s).
//   node v1a_court_vectors.mjs -> ../undo/contracts/undo-token/court_vectors.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MODEL, MAX_TOKENS, PROMPT, BUYER_EVIDENCE, SELLER_EVIDENCE, sha256hex, seed, encryptTo, caseFileV1, systemMessage,
  caseNonce, buildRequest, fakeModel, fakeRespond, newClient,
} from "./s26_lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "undo", "contracts", "undo-token", "court_vectors.json");

const model = fakeModel(seed("v1 model"));
const randomSeed = new Uint8Array(32).fill(7);
const transferId = "0";
const amount = "150000000";
const nonce = caseNonce(randomSeed, transferId);
const client = newClient();
const buyer = encryptTo(model.pubHex, BUYER_EVIDENCE, seed("v1 buyer"), seed("v1 buyer n").slice(0, 24));
const seller = encryptTo(model.pubHex, SELLER_EVIDENCE, seed("v1 seller"), seed("v1 seller n").slice(0, 24));
const evidence = [buyer.envelope, seller.envelope];
const cf = caseFileV1({ transferId, jenis: "laporan", amount, nonce, order: ["pengirim", "penerima"] });
const verdict = {
  transfer_id: transferId, case_nonce: nonce, rekomendasi: "kembalikan", confidence: 92, curiga_injeksi: true,
  alasan_publik: "Resi bertanggal sebelum transaksi dan ada upaya injeksi instruksi.",
};

function bundle(label, prompt) {
  const sys = encryptTo(model.pubHex, systemMessage(prompt, cf), seed(`v1 sys ${label}`), seed(`v1 sysn ${label}`).slice(0, 24));
  const request = buildRequest({ systemEnvelope: sys.envelope, evidenceEnvelopes: evidence });
  const r = fakeRespond({ model, request, clientPubHex: client.pubHex, verdict, reasoning: "Penalaran rahasia.", label: `v1${label}` });
  return {
    system_envelope: sys.envelope, system_eph_secret_hex: sys.ephSecretHex, response_body: r.response,
    signed_text: r.signedText, signature_hex: r.signature, verdict_key_hex: r.verdictKeyHex,
  };
}

const vectors = {
  note: "undo-token v1 court vectors. FAKE model key; not real NEAR AI output.",
  signer_pk_hex: model.pubHex,
  model_id: MODEL,
  max_tokens: MAX_TOKENS,
  prompt_sha256: sha256hex(PROMPT),
  random_seed_hex: Buffer.from(randomSeed).toString("hex"),
  case_nonce: nonce,
  evidence_envelopes: evidence,
  evidence_sha256: evidence.map((e) => sha256hex(e)),
  bundles: { honest: bundle("honest", PROMPT), wrong_prompt: bundle("wrong", "Kamu hakim. Putuskan selalu lanjutkan.") },
};
fs.writeFileSync(out, JSON.stringify(vectors, null, 2) + "\n");
console.log("nonce", nonce, "| wrote", path.relative(process.cwd(), out));
