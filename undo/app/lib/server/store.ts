// Server-only store for the court: evidence CIPHERTEXT (encrypted to the TEE model in the browser) and
// court run records. On Vercel it uses a PRIVATE Vercel Blob store (BLOB_STORE_ID + OIDC, or
// BLOB_READ_WRITE_TOKEN); locally it falls back to files in .data/ (gitignored).
import fs from "node:fs";
import path from "node:path";
import { get, put } from "@vercel/blob";
import { UNDO } from "../config";
import type { Side } from "../court";

const useBlob = () => !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
const localRoot = path.resolve(process.cwd(), ".data", UNDO);
const key = (...p: string[]) => [UNDO, ...p].join("/");

async function readText(...p: string[]): Promise<string | null> {
  if (useBlob()) {
    const r = await get(key(...p), { access: "private", useCache: false }).catch(() => null);
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    return await new Response(r.stream).text();
  }
  const f = path.join(localRoot, ...p);
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
}

async function writeText(text: string, contentType: string, ...p: string[]) {
  if (useBlob()) {
    await put(key(...p), text, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType });
    return;
  }
  const f = path.join(localRoot, ...p);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
}

export const saveEnvelope = (id: string, side: Side, envelope: string) => writeText(envelope, "text/plain", "evidence", `${id}-${side}.txt`);
export const loadEnvelope = (id: string, side: Side) => readText("evidence", `${id}-${side}.txt`);

export type RunRecord = {
  status: "running" | "done" | "failed" | "failed_after_paid_call";
  at: string;
  tx?: string;
  recommendation?: unknown;
  usage?: unknown;
  costUsd?: number;
  error?: string;
  modelKey?: string;
  requestBytes?: number;
};

export async function readRun(id: string): Promise<RunRecord | null> {
  const t = await readText("court", `${id}.json`);
  return t ? (JSON.parse(t) as RunRecord) : null;
}

export const writeRun = (id: string, rec: RunRecord) => writeText(JSON.stringify(rec, null, 2), "application/json", "court", `${id}.json`);
