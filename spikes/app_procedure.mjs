// app_procedure — council (S8 DAO) re-registers the court procedure on the dev v1 contract.
//   node app_procedure.mjs 2000      (max_tokens; the prompt hash stays the published PROMPT)
import { actions, teraToGas } from "near-api-js";
import { account as main, provider, sleep, EXPLORER } from "./lib.mjs";
import { PROMPT, sha256hex } from "./s26_lib.mjs";

const UNDO = process.env.NEAR_UNDO_V1_CONTRACT_ID;
const DAO = "nhspike-mvp6a0dx.sputnikv2.testnet";
const maxTokens = Number(process.argv[2] ?? 2000);
const policy = await provider.callFunction({ contractId: DAO, method: "get_policy", args: {} });
const args = { prompt_sha256_hex: sha256hex(PROMPT), max_tokens: maxTokens };
const kind = { FunctionCall: { receiver_id: UNDO, actions: [{ method_name: "register_procedure", args: Buffer.from(JSON.stringify(args)).toString("base64"), deposit: "0", gas: teraToGas("50").toString() }] } };
const prop = await main.signAndSendTransaction({ receiverId: DAO, actions: [actions.functionCall("add_proposal", { proposal: { description: `Undo dev: court max_tokens ${maxTokens}`, kind } }, teraToGas("100"), BigInt(policy.proposal_bond))] });
const id = Number(Buffer.from(prop.status.SuccessValue, "base64").toString());
const vote = await main.signAndSendTransaction({ receiverId: DAO, actions: [actions.functionCall("act_proposal", { id, action: "VoteApprove", proposal: kind }, teraToGas("250"), 0n)] });
console.log("DAO vote:", EXPLORER + vote.transaction.hash);
await sleep(2000);
const cfg = await provider.callFunction({ contractId: UNDO, method: "get_config", args: {} });
console.log("court procedure now:", cfg.court.max_tokens, "max_tokens, prompt", cfg.court.prompt_sha256 === sha256hex(PROMPT) ? "unchanged ✅" : "CHANGED ❌");
