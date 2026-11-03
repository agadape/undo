// S8 — Sputnik DAO v2 on testnet: create DAO -> add Transfer proposal -> approve -> funds move.
import { teraToGas, nearToYocto, yoctoToNear } from "near-api-js";
import { account, accountId, provider, txSummary, json, sleep } from "./lib.mjs";

const FACTORY = "sputnikv2.testnet";
const name = `nhspike-${Date.now().toString(36)}`;
const dao = `${name}.${FACTORY}`;
const receiver = `agent.${accountId}`;
const out = { dao };

// 1) Create DAO with us as the only council member
const createArgs = {
  config: { name, purpose: "NEAR HACKATHON spike: DAO-controlled payouts", metadata: "" },
  policy: [accountId],
};
const t0 = Date.now();
const createRes = await account.signAndSendTransaction({
  receiverId: FACTORY,
  actions: [
    (await import("near-api-js")).actions.functionCall(
      "create",
      { name, args: Buffer.from(JSON.stringify(createArgs)).toString("base64") },
      teraToGas("300"),
      nearToYocto("6"),
    ),
  ],
});
out.create = txSummary("create DAO " + dao, createRes);
out.createMs = Date.now() - t0;

const daoView = await provider.viewAccount({ accountId: dao });
console.log("DAO account:", yoctoToNear(daoView.amount, 4), "NEAR, storage", daoView.storage_usage, "code", daoView.code_hash);
const policy = await provider.callFunction({ contractId: dao, method: "get_policy", args: {} });
console.log("policy roles:", json(policy.roles.map((r) => ({ name: r.name, kind: r.kind, perms: r.permissions }))));
const bond = BigInt(policy.proposal_bond);
console.log("proposal_bond:", yoctoToNear(bond, 4), "NEAR");

// 2) Transfer proposal: DAO pays 0.1 NEAR to the agent sub-account
const amount = nearToYocto("0.1");
const kind = { Transfer: { token_id: "", receiver_id: receiver, amount: amount.toString() } };
const recvBefore = (await provider.viewAccount({ accountId: receiver })).amount;
const { actions } = await import("near-api-js");
const addRes = await account.signAndSendTransaction({
  receiverId: dao,
  actions: [
    actions.functionCall(
      "add_proposal",
      { proposal: { description: "Pay agent 0.1 NEAR for task #1", kind } },
      teraToGas("100"),
      bond,
    ),
  ],
});
out.addProposal = txSummary("add_proposal Transfer 0.1 NEAR", addRes);
const id = Number(out.addProposal.successValue);
console.log("proposal id:", id);

// 3) Approve (single council member reaches the 1/2 threshold)
const actRes = await account.signAndSendTransaction({
  receiverId: dao,
  actions: [actions.functionCall("act_proposal", { id, action: "VoteApprove", proposal: kind }, teraToGas("150"), 0n)],
});
out.act = txSummary("act_proposal VoteApprove", actRes);

await sleep(1500);
const proposal = await provider.callFunction({ contractId: dao, method: "get_proposal", args: { id } });
console.log("proposal after vote:", json({ status: proposal.status, votes: proposal.votes, kind: proposal.kind }));
const recvAfter = (await provider.viewAccount({ accountId: receiver })).amount;
const delta = BigInt(recvAfter) - BigInt(recvBefore);
console.log("receiver balance delta:", yoctoToNear(delta, 4), "NEAR");
out.status = proposal.status;
out.receiverDeltaNear = yoctoToNear(delta, 4);

// 4) Unhappy path: a proposal with the wrong bond must be rejected
const { actions: a2 } = await import("near-api-js");
try {
  const bad = await account.signAndSendTransaction({
    receiverId: dao,
    actions: [a2.functionCall("add_proposal", { proposal: { description: "bad bond", kind } }, teraToGas("100"), bond / 2n)],
  });
  out.badBond = txSummary("add_proposal with half bond", bad);
} catch (e) {
  out.badBond = (e.type ? e.type + ": " : "") + e.message.slice(0, 200);
  console.log("half bond rejected:", out.badBond);
}

console.log("\n=== S8 summary ===\n" + json(out));
console.log("my balance now:", yoctoToNear(await account.getBalance(), 4));
