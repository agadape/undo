// POST {signedDelegate: base64 NEP-366 SignedDelegate} -> our relayer submits it and pays the gas.
// Only Undo's safety actions (GASLESS_METHODS) on the demo contract, no deposit, at most 150 Tgas, a valid
// signature from an existing access key, and a call the contract will accept. See lib/server/relay.ts.
// 400 = refused (the browser shows it), 429 = limit, 502/503 = relayer trouble (the browser pays the gas itself).
import { NextResponse } from "next/server";
import { PolicyError, checkDelegate, claimDelegate, precheck, relay, takeQuota, type Checked } from "@/lib/server/relay";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { signedDelegate } = (await req.json().catch(() => ({}))) as { signedDelegate?: string };
  if (typeof signedDelegate !== "string") return NextResponse.json({ error: "body must be {signedDelegate: base64}" }, { status: 400 });
  let checked: Checked;
  try {
    checked = checkDelegate(signedDelegate);
    await precheck(checked);
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 200);
    return e instanceof PolicyError ? NextResponse.json({ error: msg }, { status: 400 }) : NextResponse.json({ error: `relayer unavailable: ${msg}` }, { status: 503 });
  }
  if (!claimDelegate(checked.id)) return NextResponse.json({ error: "delegate nonce already used" }, { status: 400 });
  if (!takeQuota(checked.senderId)) return NextResponse.json({ error: "relayer limit reached this hour" }, { status: 429 });
  try {
    return NextResponse.json(await relay(checked));
  } catch (e) {
    return NextResponse.json({ error: `relay failed: ${String((e as Error).message).slice(0, 200)}` }, { status: 502 });
  }
}
