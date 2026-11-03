// Server-only NEAR access: the court poster / council member (main account) and the demo faucet.
import { Account, FailoverRpcProvider, JsonRpcProvider, actions, teraToGas } from "near-api-js";
import { RPCS } from "../config";
import { need, optional } from "./env";

// The server starts on the second fastnear endpoint so it does not share the browsers' first choice.
// rpc.testnet.near.org is deprecated (it answers with a "stop using it" error), so it is the last fallback.
export const provider = new FailoverRpcProvider([RPCS[1], RPCS[0], RPCS[2]].map((url) => new JsonRpcProvider({ url })));

/** Our main testnet account: posts court recommendations and is the (only) S8 DAO council member. */
export const courtAccount = () => new Account(need("NEAR_ACCOUNT_ID"), provider, need("NEAR_PRIVATE_KEY") as `ed25519:${string}`);

/** Parent account for demo sub-accounts when the testnet helper is rate-limited. */
export function faucetAccount() {
  const id = optional("NEAR_UNDO_FAUCET_ID") ?? need("NEAR_S21_CONTRACT_ID");
  const key = optional("NEAR_UNDO_FAUCET_PRIVATE_KEY") ?? need("NEAR_S21_CONTRACT_PRIVATE_KEY");
  return new Account(id, provider, key as `ed25519:${string}`);
}

export async function view<T = unknown>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  return (await provider.callFunction({ contractId, method, args })) as T;
}

/** Send one function call; throws a readable error on failure. */
export async function send(acct: Account, receiverId: string, method: string, args: Record<string, unknown>, deposit = 0n, gasTera = "100") {
  const r = (await acct.signAndSendTransaction({
    receiverId,
    actions: [actions.functionCall(method, args, teraToGas(Number(gasTera)), deposit)],
  })) as { transaction: { hash: string }; status: { SuccessValue?: string; Failure?: unknown } };
  if (r.status?.Failure) {
    const s = JSON.stringify(r.status.Failure);
    throw new Error((s.match(/panicked: ([^"\\]+)/)?.[1] ?? s).slice(0, 300));
  }
  let value: unknown;
  if (r.status?.SuccessValue) {
    const s = Buffer.from(r.status.SuccessValue, "base64").toString();
    try {
      value = JSON.parse(s);
    } catch {
      value = s;
    }
  }
  return { hash: r.transaction.hash, value };
}
