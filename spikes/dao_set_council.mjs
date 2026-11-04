// dao_set_council — set the council of the Undo DAO (Sputnik v2) to our main account plus team members,
// in ONE ChangePolicy proposal so our single vote still passes it (with 3 members, later decisions
// need 2 of 3 votes: the DAO's threshold is "more than half" of the council).
//   node dao_set_council.mjs <member.testnet> [<member2.testnet> ...]          (dry run: prints the change)
//   node dao_set_council.mjs <member.testnet> [<member2.testnet> ...] --send   (proposal + our vote)
import { actions, teraToGas } from "near-api-js";
import { account as main, accountId, provider, sleep, EXPLORER } from "./lib.mjs";

const DAO = "nhspike-mvp6a0dx.sputnikv2.testnet";
const members = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!members.length || !members.every((m) => /^[a-z0-9._-]+\.testnet$|^[0-9a-f]{64}$/.test(m))) {
  console.log("usage: node dao_set_council.mjs <member.testnet> [...] [--send]");
  process.exit(1);
}
for (const m of members) {
  try {
    await provider.viewAccount({ accountId: m });
  } catch {
    console.log(`account ${m} does not exist on testnet`);
    process.exit(1);
  }
}

const policy = await provider.callFunction({ contractId: DAO, method: "get_policy", args: {} });
const council = policy.roles.find((r) => r.name === "council");
const before = council.kind.Group;
const after = [...new Set([accountId, ...before, ...members])];
council.kind = { Group: after };
const needed = Math.floor(after.length / 2) + 1;
console.log(JSON.stringify({ dao: DAO, councilBefore: before, councilAfter: after, votesNeededAfter: `${needed} of ${after.length}`, proposalBond: policy.proposal_bond }));
if (!process.argv.includes("--send")) {
  console.log("dry run (add --send to propose and vote)");
  process.exit(0);
}

const kind = { ChangePolicy: { policy } };
const prop = await main.signAndSendTransaction({
  receiverId: DAO,
  actions: [actions.functionCall("add_proposal", { proposal: { description: `Undo council: ${after.join(", ")}`, kind } }, teraToGas("100"), BigInt(policy.proposal_bond))],
});
const pid = Number(Buffer.from(prop.status.SuccessValue, "base64").toString());
const vote = await main.signAndSendTransaction({ receiverId: DAO, actions: [actions.functionCall("act_proposal", { id: pid, action: "VoteApprove", proposal: kind }, teraToGas("250"), 0n)] });
console.log("proposal:", pid, "| propose:", EXPLORER + prop.transaction.hash, "| vote:", EXPLORER + vote.transaction.hash);
await sleep(2500);
const now = await provider.callFunction({ contractId: DAO, method: "get_policy", args: {} });
console.log("council now:", JSON.stringify(now.roles.find((r) => r.name === "council").kind.Group));
