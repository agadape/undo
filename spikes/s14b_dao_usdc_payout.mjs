// S14b — fund the Sputnik DAO with a plain ft_transfer (ft_transfer_call gets refunded),
// then pay the agent 5 USDC via a DAO Transfer proposal.
import { actions, teraToGas } from "near-api-js";
import { account, accountId, provider, txSummary, json, sleep } from "./lib.mjs";

const USDC = "usdc.fakes.testnet";
const AGENT = `agent.${accountId}`;
const DAO = process.argv[2] ?? "nhspike-mvp6a0dx.sputnikv2.testnet";
const u = (x) => BigInt(Math.round(x * 1e6)).toString();
const fmt = (raw) => (Number(raw) / 1e6).toFixed(2) + " USDC";
const bal = (who) => provider.callFunction({ contractId: USDC, method: "ft_balance_of", args: { account_id: who }, blockQuery: { finality: "optimistic" } });
const call = (receiverId, method, args, deposit = 0n, gas = "50") =>
  account.signAndSendTransaction({ receiverId, actions: [actions.functionCall(method, args, teraToGas(gas), deposit)] });

const fund = txSummary("ft_transfer 50 USDC -> DAO", await call(USDC, "ft_transfer", { receiver_id: DAO, amount: u(50), memo: "treasury funding" }, 1n));
await sleep(1500);
console.log("DAO USDC:", fmt(await bal(DAO)));

const policy = await provider.callFunction({ contractId: DAO, method: "get_policy", args: {} });
const kind = { Transfer: { token_id: USDC, receiver_id: AGENT, amount: u(5) } };
const add = txSummary("add_proposal: DAO pays agent 5 USDC", await call(DAO, "add_proposal", { proposal: { description: "Pay agent 5 USDC for task #2 (retry)", kind } }, BigInt(policy.proposal_bond), "100"));
const id = Number(add.successValue);
const agentBefore = await bal(AGENT);
const act = await call(DAO, "act_proposal", { id, action: "VoteApprove", proposal: kind }, 0n, "200");
const s = txSummary("act_proposal VoteApprove", act);
await sleep(2000);
const p = await provider.callFunction({ contractId: DAO, method: "get_proposal", args: { id }, blockQuery: { finality: "optimistic" } });
console.log("proposal", id, "status:", p.status);
console.log("agent USDC:", fmt(agentBefore), "->", fmt(await bal(AGENT)), "| DAO USDC:", fmt(await bal(DAO)));
console.log(json({ fund: fund.hash, add: add.hash, act: s.hash, status: p.status }));
