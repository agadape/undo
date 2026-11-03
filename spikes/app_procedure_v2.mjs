// app_procedure_v2 — the council (S8 DAO) registers court prompt v2 (English, bilingual public reason)
// on the public demo contract. The hash is computed from the app's own lib/court.ts, so the server,
// the browser (/janji) and the contract all use the same bytes.
//   node app_procedure_v2.mjs            (dry run: prints the hashes, sends nothing)
//   node app_procedure_v2.mjs --send     (DAO proposal + vote)
import { actions, teraToGas } from "near-api-js";
import { account as main, provider, sleep, EXPLORER } from "./lib.mjs";
import { PROMPT, sha256hex } from "../undo/app/lib/court.ts";

const UNDO = process.env.NEAR_UNDO_DEMO_CONTRACT_ID;
const DAO = "nhspike-mvp6a0dx.sputnikv2.testnet";
const before = await provider.callFunction({ contractId: UNDO, method: "get_config", args: {} });
const hash = sha256hex(PROMPT);
console.log(JSON.stringify({ contract: UNDO, onChainPrompt: before.court.prompt_sha256, newPrompt: hash, maxTokens: before.court.max_tokens }));
if (before.court.prompt_sha256 === hash) {
  console.log("already registered");
  process.exit(0);
}
if (!process.argv.includes("--send")) {
  console.log("dry run (add --send to vote)");
  process.exit(0);
}

const policy = await provider.callFunction({ contractId: DAO, method: "get_policy", args: {} });
const args = { prompt_sha256_hex: hash, max_tokens: before.court.max_tokens };
const kind = { FunctionCall: { receiver_id: UNDO, actions: [{ method_name: "register_procedure", args: Buffer.from(JSON.stringify(args)).toString("base64"), deposit: "0", gas: teraToGas("50").toString() }] } };
const prop = await main.signAndSendTransaction({ receiverId: DAO, actions: [actions.functionCall("add_proposal", { proposal: { description: `Undo demo: court prompt v2 (English, bilingual public reason) sha256 ${hash}`, kind } }, teraToGas("100"), BigInt(policy.proposal_bond))] });
const id = Number(Buffer.from(prop.status.SuccessValue, "base64").toString());
const vote = await main.signAndSendTransaction({ receiverId: DAO, actions: [actions.functionCall("act_proposal", { id, action: "VoteApprove", proposal: kind }, teraToGas("250"), 0n)] });
console.log("proposal:", id, "| vote:", EXPLORER + vote.transaction.hash);
await sleep(2000);
const after = await provider.callFunction({ contractId: UNDO, method: "get_config", args: {} });
console.log(JSON.stringify({ promptNow: after.court.prompt_sha256, ok: after.court.prompt_sha256 === hash, maxTokens: after.court.max_tokens, signerUnchanged: after.court.signer === before.court.signer }));
