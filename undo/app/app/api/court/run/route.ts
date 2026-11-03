// POST {transferId}: run the private court for one dispute (ONE paid NEAR AI call per dispute).
// Free checks first (dispute state, evidence, procedure, attested model key == on-chain pin);
// then one E2EE call, the TEE signature, and post_recommendation (the contract re-checks everything).
import { NextResponse } from "next/server";
import { AttestationClient, verifyModelAttestation } from "@nearai/inference-sdk/node";
import { UNDO } from "@/lib/config";
import { MODEL, PROMPT, buildRequest, caseFileV1, encryptTo, newClient, openWith, sha256hex, systemMessage, type Side } from "@/lib/court";
import { need } from "@/lib/server/env";
import { courtAccount, send, view } from "@/lib/server/near";
import { loadEnvelope, readRun, writeRun } from "@/lib/server/store";
import type { Config, Transfer } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const fail = (msg: string, status = 409) => NextResponse.json({ error: msg }, { status });

// Soft cap on paid inference per instance (each dispute can be judged once anyway; disputes cost a bond).
const MAX_PAID_RUNS_PER_HOUR = Number(process.env.COURT_MAX_RUNS_PER_HOUR ?? 20);
let windowStart = Date.now();
let paidRuns = 0;
function allowPaidRun() {
  if (Date.now() - windowStart > 3_600_000) {
    windowStart = Date.now();
    paidRuns = 0;
  }
  return ++paidRuns <= MAX_PAID_RUNS_PER_HOUR;
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    // Anything thrown before the paid call (RPC errors etc.) costs nothing; report it as JSON.
    return fail(`court error: ${String((e as Error).message).slice(0, 240)}`, 502);
  }
}

async function handle(req: Request) {
  const { transferId, retryPaid } = (await req.json().catch(() => ({}))) as { transferId?: string; retryPaid?: boolean };
  if (!transferId || !/^\d+$/.test(transferId)) return fail("bad transferId", 400);
  const prev = await readRun(transferId);
  // A run that already paid for inference is retried only when explicitly asked (it costs again).
  const retryable = prev?.status === "failed" || (prev?.status === "failed_after_paid_call" && retryPaid === true);
  if (prev && !retryable) return NextResponse.json(prev, { status: prev.status === "done" ? 200 : 409 });

  // ---------- free checks ----------
  const cfg = await view<Config>(UNDO, "get_config");
  const t = await view<Transfer | null>(UNDO, "get_transfer", { transfer_id: transferId });
  const d = t?.dispute;
  if (!t || t.status !== "Disputed" || !d) return fail("transfer is not in a dispute");
  if (d.recommendation) return fail("a recommendation is already stored on-chain");
  const deadlinePassed = BigInt(Date.now()) * 1_000_000n >= BigInt(d.evidence_deadline);
  if (!(d.evidence_sender && d.evidence_receiver) && !deadlinePassed) return fail("wait for both sides' evidence or the evidence deadline");
  if (cfg.court.model_id !== MODEL || cfg.court.prompt_sha256 !== sha256hex(PROMPT) || !cfg.court.signer) return fail("court procedure on-chain differs from this server");

  const order: Side[] = [];
  const envelopes: string[] = [];
  for (const [side, hash] of [["pengirim", d.evidence_sender], ["penerima", d.evidence_receiver]] as [Side, string | null][]) {
    if (!hash) continue;
    const env = await loadEnvelope(transferId, side);
    if (!env || sha256hex(env) !== hash) return fail(`the ${side} side committed evidence but did not upload it to this court`);
    order.push(side);
    envelopes.push(env);
  }

  const apiKey = need("NEAR_AI_API_KEY");
  const att = new AttestationClient({ apiKey });
  const fetched = await att.fetchModelAttestations({ model: MODEL, signingAlgo: "ed25519" });
  const verified = [];
  for (const a of fetched.attestations) {
    try {
      verified.push(await verifyModelAttestation({ attestation: a, clientBinding: fetched.clientBinding }));
    } catch {
      /* skip unverifiable */
    }
  }
  const modelKey = verified.find((v) => v.signingPublicKey)?.signingPublicKey?.replace(/^0x/, "");
  if (!modelKey) return fail("no verified NEAR AI model attestation (nothing was spent)", 502);
  if (modelKey !== cfg.court.signer) return fail("the attested model key differs from the key pinned by the council (nothing was spent)", 502);

  // ---------- one paid call ----------
  if (!allowPaidRun()) return fail("batas sidang per jam tercapai di server ini; coba lagi nanti (tidak ada biaya)", 429);
  await writeRun(transferId, { status: "running", at: new Date().toISOString(), modelKey });
  let paid = false;
  try {
    const cf = caseFileV1({ transferId, jenis: d.origin === "Report" ? "laporan" : "bantahan", amount: t.amount, nonce: d.case_nonce, order });
    const sys = encryptTo(modelKey, systemMessage(PROMPT, cf));
    const request = buildRequest({ model: MODEL, systemEnvelope: sys.envelope, evidenceEnvelopes: envelopes, maxTokens: cfg.court.max_tokens });
    const client = newClient(); // fresh per case, never stored
    const res = await fetch("https://cloud-api.near.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept-Encoding": "identity",
        "x-signing-algo": "ed25519",
        "x-client-pub-key": client.pubHex,
        "x-model-pub-key": modelKey,
        "x-encryption-version": "2",
        "x-no-aliasing": "true",
        "x-encrypt-all-fields": "true",
      },
      body: Buffer.from(request, "utf8"),
    });
    paid = true;
    const responseBody = Buffer.from(await res.arrayBuffer()).toString("utf8");
    if (res.status !== 200) throw new Error(`NEAR AI HTTP ${res.status}: ${responseBody.slice(0, 200)}`);
    const resp = JSON.parse(responseBody);
    const choice = resp.choices?.[0];
    if (typeof choice?.message?.content !== "string" || !choice.message.content) {
      throw new Error(
        `model returned no verdict (finish_reason=${choice?.finish_reason}, completion_tokens=${resp.usage?.completion_tokens}, reasoning_tokens=${resp.usage?.reasoning_tokens ?? resp.usage?.completion_tokens_details?.reasoning_tokens}); raise max_tokens in the procedure`,
      );
    }
    const verdictKey = openWith(client.x25519Secret, choice.message.content).keyHex;
    let sig: { signedText: string; signature: string } | undefined;
    for (let i = 0; i < 10 && !sig; i++) {
      try {
        sig = await att.fetchCompletionSignature({ completionId: resp.id, signingAlgo: "ed25519" });
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (!sig) throw new Error("NEAR AI signature not available");
    const posted = await send(
      courtAccount(),
      UNDO,
      "post_recommendation",
      {
        transfer_id: transferId,
        signed_text: sig.signedText,
        signature_hex: sig.signature,
        system_envelope: sys.envelope,
        system_eph_secret_hex: sys.ephSecretHex,
        evidence_envelopes: envelopes,
        response_body: responseBody,
        verdict_key_hex: verdictKey,
      },
      0n,
      "300",
    );
    const usage = resp.usage ?? {};
    const rec = {
      status: "done" as const,
      at: new Date().toISOString(),
      tx: posted.hash,
      recommendation: posted.value,
      usage,
      costUsd: ((usage.prompt_tokens ?? 0) * 0.08 + (usage.completion_tokens ?? 0) * 0.5) / 1e6,
      modelKey,
      requestBytes: request.length,
    };
    await writeRun(transferId, rec);
    return NextResponse.json(rec);
  } catch (e) {
    const rec = { status: paid ? ("failed_after_paid_call" as const) : ("failed" as const), at: new Date().toISOString(), error: String((e as Error).message).slice(0, 300) };
    await writeRun(transferId, rec);
    return NextResponse.json(rec, { status: 502 });
  }
}
