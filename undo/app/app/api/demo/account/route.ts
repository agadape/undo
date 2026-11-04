// POST {publicKey} -> create a throwaway TESTNET account for that key (the browser keeps the private key).
// Tries the official testnet helper first; when it is rate-limited, creates a sub-account of our faucet.
import { NextResponse } from "next/server";
import { nearToYocto } from "near-api-js";
import { faucetAccount } from "@/lib/server/near";

export const runtime = "nodejs";

const LIMIT_PER_HOUR = 40;
let windowStart = Date.now();
let count = 0;

const rand = () => Math.random().toString(36).slice(2, 8);

export async function POST(req: Request) {
  const { publicKey } = (await req.json().catch(() => ({}))) as { publicKey?: string };
  if (!publicKey || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(publicKey)) {
    return NextResponse.json({ error: "publicKey must be an ed25519 key" }, { status: 400 });
  }
  if (Date.now() - windowStart > 3_600_000) {
    windowStart = Date.now();
    count = 0;
  }
  if (++count > LIMIT_PER_HOUR) return NextResponse.json({ error: "too many demo accounts this hour" }, { status: 429 });

  const helperId = `undo-${rand()}.testnet`;
  try {
    const res = await fetch("https://helper.nearprotocol.com/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newAccountId: helperId, newAccountPublicKey: publicKey }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return NextResponse.json({ accountId: helperId, via: "testnet helper (10 NEAR)" });
  } catch {
    /* fall through to the faucet */
  }

  try {
    const faucet = faucetAccount();
    const prefix = `u${rand()}`;
    await faucet.createSubAccount({ accountOrPrefix: prefix, publicKey, nearToTransfer: nearToYocto("0.3") });
    return NextResponse.json({ accountId: `${prefix}.${faucet.accountId}`, via: "faucet sub-account (0.3 NEAR)" });
  } catch (e) {
    return NextResponse.json({ error: `could not create a demo account: ${String((e as Error).message).slice(0, 200)}` }, { status: 502 });
  }
}
