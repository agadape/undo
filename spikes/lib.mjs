// Shared helpers for spikes. Reads credentials from ../.env.
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Account, JsonRpcProvider, FailoverRpcProvider } from "near-api-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env"), quiet: true });

export const EXPLORER = "https://testnet.nearblocks.io/txns/";

export const provider = new FailoverRpcProvider([
  new JsonRpcProvider({ url: "https://rpc.testnet.fastnear.com" }),
  new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" }),
  new JsonRpcProvider({ url: "https://rpc.testnet.near.org" }),
]);

export const accountId = process.env.NEAR_ACCOUNT_ID;
export const account = new Account(accountId, provider, process.env.NEAR_PRIVATE_KEY);

export const json = (v) =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2);

export function txSummary(label, res) {
  const hash = res?.transaction?.hash ?? res?.transaction_outcome?.id;
  const status = res?.status ?? res?.final_execution_status;
  const failure = res?.status?.Failure;
  const ok = !failure;
  const out = {
    label,
    ok,
    hash,
    explorer: hash ? EXPLORER + hash : undefined,
    gasBurnt:
      (res?.transaction_outcome?.outcome?.gas_burnt ?? 0) +
      (res?.receipts_outcome ?? []).reduce((a, r) => a + (r.outcome?.gas_burnt ?? 0), 0),
    logs: (res?.receipts_outcome ?? []).flatMap((r) => r.outcome?.logs ?? []),
    successValue: status?.SuccessValue
      ? Buffer.from(status.SuccessValue, "base64").toString()
      : undefined,
    failure,
  };
  console.log(json(out));
  return out;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
