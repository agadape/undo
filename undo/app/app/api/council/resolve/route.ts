// POST {transferId, reverse, reason}: the council decides a dispute through the Sputnik DAO
// (proposal + vote by our main account, the DAO's only member during the hackathon).
import { NextResponse } from "next/server";
import { teraToGas } from "near-api-js";
import { DAO, UNDO } from "@/lib/config";
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
    const policy = await view<{ proposal_bond: string }>(DAO, "get_policy");
    const kind = {
      FunctionCall: {
        receiver_id: UNDO,
        actions: [
          {
            method_name: "resolve",
            args: Buffer.from(JSON.stringify({ transfer_id: transferId, reverse, reason: why })).toString("base64"),
            deposit: "0",
            gas: teraToGas("50").toString(),
          },
        ],
      },
    };
    const council = courtAccount();
    const prop = await send(council, DAO, "add_proposal", { proposal: { description: `Undo #${transferId}: ${why}`, kind } }, BigInt(policy.proposal_bond), "100");
    const vote = await send(council, DAO, "act_proposal", { id: Number(prop.value), action: "VoteApprove", proposal: kind }, 0n, "250");
    return NextResponse.json({ ok: true, proposalTx: prop.hash, voteTx: vote.hash });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message).slice(0, 300) }, { status: 502 });
  }
}
