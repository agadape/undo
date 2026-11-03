// S14 — testnet stablecoin (usdc.fakes.testnet, NEP-141, 6 decimals):
// mint, storage_deposit, ft_transfer, unregistered-receiver failure, ft_transfer_call into a Sputnik DAO,
// and a DAO proposal that pays the agent in USDC.
import { actions, teraToGas, nearToYocto } from "near-api-js";
import { account, accountId, provider, txSummary, json, sleep } from "./lib.mjs";

const USDC = "usdc.fakes.testnet";
const AGENT = `agent.${accountId}`;
const DAO = process.argv[2] ?? "nhspike-mvp6a0dx.sputnikv2.testnet";
const u = (x) => BigInt(Math.round(x * 1e6)).toString();
const fmt = (raw) => (Number(raw) / 1e6).toFixed(2) + " USDC";
const bal = async (who) => provider.callFunction({ contractId: USDC, method: "ft_balance_of", args: { account_id: who } });
const call = (receiverId, method, args, deposit = 0n, gas = "50") =>
  account.signAndSendTransaction({ receiverId, actions: [actions.functionCall(method, args, teraToGas(gas), deposit)] });
const out = {};

// 1) Register storage for us, the agent and the DAO
for (const who of [accountId, AGENT, DAO]) {
  const reg = await provider.callFunction({ contractId: USDC, method: "storage_balance_of", args: { account_id: who } });
  if (!reg) txSummary(`storage_deposit for ${who}`, await call(USDC, "storage_deposit", { account_id: who, registration_only: true }, nearToYocto("0.00125")));
  else console.log("already registered:", who);
}

// 2) Mint (try the common arg shapes)
let minted = false;
for (const args of [{ account_id: accountId, amount: u(1000) }, { receiver_id: accountId, amount: u(1000) }]) {
  try {
    out.mint = txSummary(`mint 1000 USDC ${JSON.stringify(Object.keys(args))}`, await call(USDC, "mint", args));
    if (out.mint.ok) { minted = true; break; }
  } catch (e) {
    console.log("mint failed with", Object.keys(args), "->", (e.type ?? "") + " " + e.message.slice(0, 200));
  }
}
console.log("my USDC:", fmt(await bal(accountId)));
if (!minted) process.exit(1);

// 3) ft_transfer to the agent (needs exactly 1 yocto)
const agentBefore = await bal(AGENT);
out.transfer = txSummary("ft_transfer 10 USDC -> agent", await call(USDC, "ft_transfer", { receiver_id: AGENT, amount: u(10), memo: "S14 payout" }, 1n));
console.log("agent USDC:", fmt(agentBefore), "->", fmt(await bal(AGENT)));

// 4) Unhappy path: receiver without storage registration
try {
  const r = await call(USDC, "ft_transfer", { receiver_id: "nobody-" + Date.now() + ".testnet", amount: u(1) }, 1n);
  out.unregistered = txSummary("ft_transfer to unregistered account", r);
} catch (e) {
  out.unregistered = (e.type ? e.type + ": " : "") + e.message.slice(0, 200);
  console.log("unregistered receiver rejected:", out.unregistered);
}
// and without the 1 yocto deposit
try {
  const r = await call(USDC, "ft_transfer", { receiver_id: AGENT, amount: u(1) }, 0n);
  out.noYocto = txSummary("ft_transfer without 1 yocto", r);
} catch (e) {
  out.noYocto = (e.type ? e.type + ": " : "") + e.message.slice(0, 200);
  console.log("no-yocto rejected:", out.noYocto);
}

// 5) ft_transfer_call into the Sputnik DAO (does the DAO accept FT deposits?)
const daoBefore = await bal(DAO);
out.toDao = txSummary("ft_transfer_call 50 USDC -> DAO", await call(USDC, "ft_transfer_call", { receiver_id: DAO, amount: u(50), msg: "" }, 1n, "100"));
await sleep(1000);
console.log("DAO USDC:", fmt(daoBefore), "->", fmt(await bal(DAO)));

// 6) DAO pays the agent 5 USDC via proposal
const policy = await provider.callFunction({ contractId: DAO, method: "get_policy", args: {} });
const kind = { Transfer: { token_id: USDC, receiver_id: AGENT, amount: u(5) } };
const add = txSummary("add_proposal: DAO pays agent 5 USDC", await call(DAO, "add_proposal", { proposal: { description: "Pay agent 5 USDC for task #2", kind } }, BigInt(policy.proposal_bond), "100"));
const id = Number(add.successValue);
const agentMid = await bal(AGENT);
out.daoPay = txSummary("act_proposal VoteApprove", await call(DAO, "act_proposal", { id, action: "VoteApprove", proposal: kind }, 0n, "200"));
await sleep(1500);
const p = await provider.callFunction({ contractId: DAO, method: "get_proposal", args: { id } });
console.log("proposal", id, "status:", p.status);
console.log("agent USDC:", fmt(agentMid), "->", fmt(await bal(AGENT)), "| DAO USDC:", fmt(await bal(DAO)));
out.proposalStatus = p.status;

console.log("\n=== S14 summary ===\n" + json(out));
