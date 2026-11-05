// POST {transferId, reverse, reason, passcode}: our council member (the main account) proposes `resolve` on the
// Sputnik DAO and votes for it. With more council members a decision needs more votes: the others vote with
// their own wallets on /dewan. An open proposal for the same decision is reused instead of creating a new one.
import { NextResponse } from "next/server";
import { teraToGas } from "near-api-js";
import { DAO, UNDO } from "@/lib/config";
import { approvals, loadCouncil } from "@/lib/council";
import { requestLang } from "@/lib/lang";
import { optional } from "@/lib/server/env";
import { courtAccount, send, view } from "@/lib/server/near";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { transferId, reverse, reason, passcode } = (await req.json().catch(() => ({}))) as { transferId?: string; reverse?: boolean; reason?: string; passcode?: string };
  if (!transferId || !/^\d+$/.test(transferId) || typeof reverse !== "boolean") return NextResponse.json({ error: "bad request" }, { status: 400 });
  // This route signs with the council member's key: on a public deployment it needs COUNCIL_PASSCODE.
  const expected = optional("COUNCIL_PASSCODE");
  if (expected ? passcode !== expected : !!process.env.VERCEL) {
    const en = requestLang(req) === "en";
    const error = expected
      ? en ? "wrong council passcode" : "passcode dewan salah"
      : en ? "council actions are disabled on this deployment (COUNCIL_PASSCODE is not set)" : "aksi dewan dimatikan di deployment ini (COUNCIL_PASSCODE belum di-set)";
    return NextResponse.json({ error }, { status: 403 });
  }
  const why = (reason ?? "").slice(0, 300) || (reverse ? "Dewan: kembalikan" : "Dewan: teruskan ke penerima");
  try {
    const council = courtAccount();
    const state = await loadCouncil(view);
    if (!state.members.includes(council.accountId)) return NextResponse.json({ error: `${council.accountId} is not on the council` }, { status: 409 });
    let open = state.proposals.find((p) => p.status === "InProgress" && p.transferId === transferId && p.reverse === reverse);
    let proposalTx: string | undefined;
    if (!open) {
      const kind = {
        FunctionCall: {
          receiver_id: UNDO,
          actions: [{ method_name: "resolve", args: Buffer.from(JSON.stringify({ transfer_id: transferId, reverse, reason: why })).toString("base64"), deposit: "0", gas: teraToGas("50").toString() }],
        },
      };
      const prop = await send(council, DAO, "add_proposal", { proposal: { description: `Undo #${transferId}: ${why}`, kind } }, BigInt(state.bond), "100");
      proposalTx = prop.hash;
      const id = Number(prop.value);
      open = { id, kind, votes: {}, status: "InProgress" } as unknown as typeof open;
    }
    let voteTx: string | undefined;
    if (!open!.votes[council.accountId]) {
      voteTx = (await send(council, DAO, "act_proposal", { id: open!.id, action: "VoteApprove", proposal: open!.kind }, 0n, "250")).hash;
    }
    const after = await view<{ status: string; votes: Record<string, string> }>(DAO, "get_proposal", { id: open!.id });
    return NextResponse.json({
      ok: true,
      proposalId: open!.id,
      status: after.status,
      approvals: approvals(after as never),
      needed: state.needed,
      proposalTx,
      voteTx,
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message).slice(0, 300) }, { status: 502 });
  }
}
