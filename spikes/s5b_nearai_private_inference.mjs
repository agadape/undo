// S5b — NEAR AI Cloud private inference (needs NEAR_AI_API_KEY in ../.env; key is never printed).
// A) Official SDK: verified Gateway + model attestation, E2EE prompt, verifyResponse().
// B) Manual: preflight model report (nonce) -> chat with exact bytes -> /v1/signature -> EIP-191 check.
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { verifyMessage } from "viem";
import { InferenceClient } from "@nearai/inference-sdk/node";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env"), quiet: true });
const apiKey = process.env.NEAR_AI_API_KEY;
if (!apiKey) { console.log("NEAR_AI_API_KEY missing in .env — add it and re-run."); process.exit(1); }

const BASE = "https://cloud-api.near.ai/v1";
const MODEL = process.argv[2] ?? "z-ai/glm-5.3-flash";
const PROMPT = "Payroll note (confidential): Alice 4200 USDC, Bob 3900 USDC, Carol 5100 USDC. Reply with only the total as a number.";
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const out = { model: MODEL };

// ---------- A) SDK path ----------
console.log(`=== A) SDK, e2ee=true, model=${MODEL}`);
try {
  const client = new InferenceClient({ baseUrl: BASE, apiKey, e2ee: true });
  const t0 = Date.now();
  const completion = await client.chat.completions.create({ model: MODEL, messages: [{ role: "user", content: PROMPT }] });
  const chatMs = Date.now() - t0;
  const t1 = Date.now();
  const receipt = await client.verifyResponse(completion.id);
  out.sdk = {
    answer: completion.choices?.[0]?.message?.content?.trim(),
    usage: completion.usage,
    chatMs,
    verifyMs: Date.now() - t1,
    signatureKind: receipt.signatureKind,
    signer: receipt.signature?.signing_address ?? receipt.signature?.signingAddress,
    signingAlgo: receipt.signature?.signing_algo ?? receipt.signature?.signingAlgo,
  };
  console.log(JSON.stringify(out.sdk, null, 2));
} catch (e) {
  out.sdkError = `${e?.code ?? e?.name}: ${e?.message}`.slice(0, 500);
  console.log("SDK path failed:", out.sdkError);
}

// ---------- B) Manual path ----------
console.log(`\n=== B) manual verification (ecdsa)`);
const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
try {
  const nonce = crypto.randomBytes(32).toString("hex");
  const repUrl = `${BASE}/attestation/report?${new URLSearchParams({ model: MODEL, provider: "near", signing_algo: "ecdsa", nonce })}`;
  const rep = await (await fetch(repUrl, { headers })).json();
  const cands = rep.model_attestations ?? [];
  const signers = cands.map((c) => (c.signing_address ?? c.signingAddress ?? "").toLowerCase()).filter(Boolean);
  console.log("report keys:", Object.keys(rep).join(","), "| model candidates:", cands.length, "| signers:", signers);
  const nonceBound = JSON.stringify(rep).includes(nonce);
  console.log("preflight nonce present in report:", nonceBound);

  const body = JSON.stringify({ model: MODEL, messages: [{ role: "user", content: PROMPT }], stream: false });
  const reqBytes = Buffer.from(body, "utf8");
  const t0 = Date.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", "x-no-aliasing": "true", "Accept-Encoding": "identity" },
    body: reqBytes,
  });
  const respBytes = Buffer.from(await res.arrayBuffer());
  const chatMs = Date.now() - t0;
  const resp = JSON.parse(respBytes.toString("utf8"));
  console.log("chat HTTP", res.status, "in", chatMs, "ms; id:", resp.id, "| answer:", resp.choices?.[0]?.message?.content?.trim());

  let sig;
  for (let i = 0; i < 10; i++) {
    const r = await fetch(`${BASE}/signature/${encodeURIComponent(resp.id)}?signing_algo=ecdsa&model=${encodeURIComponent(MODEL)}`, { headers });
    if (r.status === 404) { await new Promise((ok) => setTimeout(ok, 1500)); continue; }
    sig = await r.json();
    break;
  }
  if (!sig || sig.error_code) throw new Error("signature unavailable: " + JSON.stringify(sig).slice(0, 300));
  const expectedText = sig.signature_kind === "gateway"
    ? `${sha256(reqBytes)}:${sha256(respBytes)}`
    : `${MODEL}:${sha256(reqBytes)}:${sha256(respBytes)}`;
  const textMatches = sig.text === expectedText;
  const sigValid = await verifyMessage({ address: sig.signing_address, message: sig.text, signature: sig.signature });
  const signerInPreflight = signers.includes(String(sig.signing_address).toLowerCase());
  out.manual = {
    signatureKind: sig.signature_kind, signer: sig.signing_address, textMatchesExactBytes: textMatches,
    eip191Valid: sigValid, signerMatchesPreflightModelReport: signerInPreflight, nonceBoundInReport: nonceBound,
    chatMs, usage: resp.usage,
  };
  console.log(JSON.stringify(out.manual, null, 2));
} catch (e) {
  out.manualError = String(e?.message ?? e).slice(0, 500);
  console.log("manual path failed:", out.manualError);
}

console.log("\n=== S5b summary ===\n" + JSON.stringify(out, null, 2));
