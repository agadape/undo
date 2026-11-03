// POST {transferId, side, envelope}: store an evidence envelope (ciphertext only) for the court.
// Accepted only if its sha256 equals what that side already committed on-chain.
import { NextResponse } from "next/server";
import { UNDO } from "@/lib/config";
import { sha256hex, type Side } from "@/lib/court";
import { view } from "@/lib/server/near";
import { saveEnvelope, loadEnvelope, readRun } from "@/lib/server/store";
import type { Transfer } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { transferId, side, envelope } = (await req.json().catch(() => ({}))) as { transferId?: string; side?: Side; envelope?: string };
  if (!transferId || !/^\d+$/.test(transferId)) return NextResponse.json({ error: "bad transferId" }, { status: 400 });
  if (side !== "pengirim" && side !== "penerima") return NextResponse.json({ error: "bad side" }, { status: 400 });
  if (!envelope || envelope.length > 64_000 || !/^[0-9a-f]+$/.test(envelope)) return NextResponse.json({ error: "envelope must be lowercase hex (≤ 32 KB)" }, { status: 400 });

  const t = await view<Transfer | null>(UNDO, "get_transfer", { transfer_id: transferId });
  const d = t?.dispute;
  if (!t || t.status !== "Disputed" || !d) return NextResponse.json({ error: "transfer is not in a dispute" }, { status: 409 });
  const committed = side === "pengirim" ? d.evidence_sender : d.evidence_receiver;
  if (!committed) return NextResponse.json({ error: "commit the evidence hash on-chain first" }, { status: 409 });
  if (committed !== sha256hex(envelope)) return NextResponse.json({ error: "envelope does not match the on-chain commitment" }, { status: 409 });
  await saveEnvelope(transferId, side, envelope);
  return NextResponse.json({ ok: true, sha256: committed });
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  return NextResponse.json({
    stored: { pengirim: !!(await loadEnvelope(id, "pengirim")), penerima: !!(await loadEnvelope(id, "penerima")) },
    run: await readRun(id),
  });
}
