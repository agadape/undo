// GET: Coba Curi dashboard numbers, computed from the chain (plus the local guard heartbeat).
// The demo account's private key is returned only when COBACURI_PUBLISH_KEY=1 (publishing is a human decision).
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { optional } from "@/lib/server/env";
import { provider, view } from "@/lib/server/near";
import type { AccountView, BalanceView, Config, Transfer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const contractId = optional("COBACURI_CONTRACT_ID");
  const demoId = optional("COBACURI_DEMO_ID");
  const guardId = optional("COBACURI_GUARD_ID");
  if (!contractId || !demoId || !guardId) return NextResponse.json({ error: "Coba Curi is not deployed (spikes/cc_deploy.mjs)" }, { status: 404 });
  try {
    const [cfg, bal, acct, out, keys, code] = await Promise.all([
      view<Config>(contractId, "get_config"),
      view<BalanceView>(contractId, "balance_of", { account_id: demoId }),
      view<AccountView>(contractId, "get_account", { account_id: demoId }),
      view<Transfer[]>(contractId, "get_outgoing", { account_id: demoId, limit: 100 }),
      provider.viewAccessKeyList({ accountId: contractId }),
      provider.viewAccount({ accountId: contractId }),
    ]);
    const attempts = out.filter((t) => t.kind !== "Sweep");
    const contestNs = BigInt(cfg.contest_window_sec) * 1_000_000_000n;
    // Escaped = reached someone other than the guard/demo, or matured untouched (the attacker can cash it out).
    const nowNs = BigInt(Date.now()) * 1_000_000n;
    const escaped = attempts
      .filter(
        (t) =>
          (t.status === "Settled" && t.final_to !== guardId && t.final_to !== demoId) ||
          (t.status === "Pending" && nowNs >= BigInt(t.unlock_at) && t.to !== guardId && t.to !== demoId),
      )
      .reduce((s, t) => s + BigInt(t.amount), 0n);
    const saved = out.filter((t) => t.status === "Reversed" || (t.kind === "Sweep" && t.status === "Settled")).reduce((s, t) => s + BigInt(t.amount), 0n);
    const reactions = attempts
      .filter((t) => t.frozen_until)
      .map((t) => Number((BigInt(t.frozen_until!) - contestNs - BigInt(t.created_at)) / 1_000_000_000n))
      .filter((s) => s >= 0);
    let heartbeat: unknown = null;
    try {
      heartbeat = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), ".data", "guard", "heartbeat.json"), "utf8"));
    } catch {
      /* guard not running locally */
    }
    return NextResponse.json({
      contractId,
      demoId,
      guardId,
      locked: ((keys as { keys?: unknown[] }).keys ?? []).length === 0,
      codeHash: (code as { code_hash: string }).code_hash,
      windowSec: cfg.window_sec,
      contestSec: cfg.contest_window_sec,
      balance: bal,
      demoLocked: acct.locked,
      attempts: attempts.length,
      frozenNow: out.filter((t) => t.status === "Frozen").length,
      inDispute: out.filter((t) => t.status === "Disputed").length,
      reversed: attempts.filter((t) => t.status === "Reversed").length,
      escaped: escaped.toString(),
      saved: saved.toString(),
      reactionSec: reactions,
      recent: attempts.slice(0, 15).map((t) => ({ id: t.id, kind: t.kind, to: t.to, amount: t.amount, status: t.status, created_at: t.created_at, final_to: t.final_to })),
      heartbeat,
      publishedKey: optional("COBACURI_PUBLISH_KEY") === "1" ? optional("COBACURI_DEMO_PRIVATE_KEY") : null,
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message).slice(0, 200) }, { status: 502 });
  }
}
