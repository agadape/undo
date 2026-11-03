// council_resolve — the council (S8 DAO, our main account is its member) decides one dispute on the
// public demo contract: the same DAO proposal + vote as /api/council/resolve, without the web passcode.
//   node council_resolve.mjs <transferId> <reverse:true|false> "<public reason>"          (dry run)
//   node council_resolve.mjs <transferId> <reverse:true|false> "<public reason>" --send   (proposal + vote)
import { actions, teraToGas } from "near-api-js";
import { account as main, provider, sleep, EXPLORER } from "./lib.mjs";

const UNDO = process.env.NEAR_UNDO_DEMO_CONTRACT_ID;
const DAO = "nhspike-mvp6a0dx.sputnikv2.testnet";
const [id, rev, reason] = process.argv.slice(2);
if (!/^\d+$/.test(id ?? "") || !["true", "false"].includes(rev) || !reason) {
  console.log('usage: node council_resolve.mjs <transferId> <true|false> "<reason>" [--send]');
  process.exit(1);
}
const reverse = rev === "true";
const t = await provider.callFunction({ contractId: UNDO, method: "get_transfer", args: { transfer_id: id } });
const rec = t?.dispute?.recommendation;
console.log(JSON.stringify({ contract: UNDO, id, status: t?.status, from: t?.from, to: t?.to, amount: t?.amount, recommendation: rec?.rekomendasi, confidence: rec?.confidence, reverse, reasonBytes: Buffer.byteLength(reason) }));
if (t?.status !== "Disputed") {
  console.log("not disputed — nothing to do");
  process.exit(1);
}
if (!process.argv.includes("--send")) {
  console.log("dry run (add --send to vote)");
  process.exit(0);
}

const policy = await provider.callFunction({ contractId: DAO, method: "get_policy", args: {} });
const kind = { FunctionCall: { receiver_id: UNDO, actions: [{ method_name: "resolve", args: Buffer.from(JSON.stringify({ transfer_id: id, reverse, reason })).toString("base64"), deposit: "0", gas: teraToGas("50").toString() }] } };
const prop = await main.signAndSendTransaction({ receiverId: DAO, actions: [actions.functionCall("add_proposal", { proposal: { description: `Undo demo #${id}: ${reason}`.slice(0, 900), kind } }, teraToGas("100"), BigInt(policy.proposal_bond))] });
const pid = Number(Buffer.from(prop.status.SuccessValue, "base64").toString());
const vote = await main.signAndSendTransaction({ receiverId: DAO, actions: [actions.functionCall("act_proposal", { id: pid, action: "VoteApprove", proposal: kind }, teraToGas("250"), 0n)] });
console.log("proposal:", pid, "| vote:", EXPLORER + vote.transaction.hash);
await sleep(2500);
const after = await provider.callFunction({ contractId: UNDO, method: "get_transfer", args: { transfer_id: id } });
console.log(JSON.stringify({ status: after.status, final_to: after.final_to, decided_by: after.dispute?.decided_by, council_reason: after.dispute?.council_reason }));
