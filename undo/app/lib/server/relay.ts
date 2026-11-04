// Server-only gasless relayer (NEP-366 meta-transactions) for Undo's safety actions.
// The browser signs a DelegateAction with the demo account's key; we check it against a strict policy,
// then wrap it in a transaction that our relayer account signs and pays for. The relayer can only submit
// exactly what the user signed: the protocol rejects any change, a replay or an expired delegate.
// Everything the chain would reject is refused here first, so nobody can make the relayer pay for failures.
import { createHash, createPublicKey, verify } from "node:crypto";
import { deserialize } from "borsh";
import { Account, SCHEMA, actions, baseEncode, encodeDelegateAction, encodeSignedDelegate } from "near-api-js";
import { GASLESS_METHODS, RPCS, UNDO } from "../config";
import { need, optional } from "./env";
import { provider, view } from "./near";

const MAX_GAS = 150n * 10n ** 12n;
const MAX_BYTES = 2048;
const GLOBAL_PER_HOUR = Number(optional("RELAY_MAX_PER_HOUR") ?? 120);
const SENDER_PER_HOUR = 20;
/** The one argument each relayed method takes. */
const ARG: Record<string, string[]> = {
  panic: ["account_id"],
  unlock: ["account_id"],
  cancel_recovery_change: ["account_id"],
  cancel_contact: ["account_id", "contact_id"],
  release: ["transfer_id"],
  finalize: ["transfer_id"],
  release_expired: ["transfer_id"],
};
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** A request the policy or the contract's rules refuse (HTTP 400). Any other error is an outage (HTTP 503). */
export class PolicyError extends Error {}

type FunctionCall = { methodName: string; args: number[] | Uint8Array; gas: bigint; deposit: bigint };
type Decoded = {
  delegateAction: {
    senderId: string;
    receiverId: string;
    actions: Record<string, unknown>[];
    nonce: bigint;
    maxBlockHeight: bigint;
    publicKey: { ed25519Key?: { data: number[] | Uint8Array } };
  };
  signature: { ed25519Signature?: { data: number[] | Uint8Array } };
};
export type Checked = { sd: Decoded; id: string; senderId: string; publicKey: string; method: string; args: Record<string, string> };

/** Decode a base64 SignedDelegate, check it against the policy and verify its signature. */
export function checkDelegate(b64: string): Checked {
  const bytes = Buffer.from(b64, "base64");
  if (!bytes.length || bytes.length > MAX_BYTES) throw new PolicyError("signedDelegate must be base64, at most 2 KB");
  let sd: Decoded;
  try {
    sd = deserialize(SCHEMA.SignedDelegate, bytes) as Decoded;
  } catch {
    throw new PolicyError("signedDelegate is not a valid NEP-366 SignedDelegate");
  }
  // borsh ignores trailing bytes; refuse them so one delegate has exactly one encoding.
  if (encodeSignedDelegate(sd as never).length !== bytes.length) throw new PolicyError("signedDelegate has trailing bytes");
  const da = sd.delegateAction;
  if (da.receiverId !== UNDO) throw new PolicyError(`only calls to ${UNDO} are relayed`);
  if (da.actions.length !== 1 || Object.keys(da.actions[0]).join() !== "functionCall") throw new PolicyError("exactly one function call is relayed");
  const fc = da.actions[0].functionCall as FunctionCall;
  if (!GASLESS_METHODS.includes(fc.methodName) || !ARG[fc.methodName]) throw new PolicyError(`only ${GASLESS_METHODS.join(", ")} are relayed`);
  if (BigInt(fc.deposit) !== 0n) throw new PolicyError("relayed calls cannot attach a deposit");
  if (BigInt(fc.gas) > MAX_GAS) throw new PolicyError("at most 150 Tgas per relayed call");
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(Buffer.from(fc.args).toString("utf8"));
  } catch {
    throw new PolicyError("function call args must be JSON");
  }
  const want = ARG[fc.methodName];
  const isObj = !!args && typeof args === "object" && !Array.isArray(args);
  const okArgs =
    isObj &&
    Object.keys(args).sort().join() === [...want].sort().join() &&
    want.every((k) => typeof args[k] === "string" && (k === "transfer_id" ? /^\d{1,19}$/.test(args[k] as string) : /^[a-z0-9._-]{2,64}$/.test(args[k] as string)));
  if (!okArgs) throw new PolicyError(`${fc.methodName} takes exactly {${want.join(", ")}}`);

  // The signature covers sha256(NEP-366 prefix + DelegateAction); only ed25519 keys are relayed.
  const pk = da.publicKey.ed25519Key?.data;
  const sig = sd.signature.ed25519Signature?.data;
  if (!pk || !sig) throw new PolicyError("only ed25519 keys are relayed");
  const digest = createHash("sha256").update(encodeDelegateAction(da as never)).digest();
  const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(pk)]), format: "der", type: "spki" });
  if (!verify(null, digest, key, Buffer.from(sig))) throw new PolicyError("invalid signature");
  // The signature covers sender, key, nonce and actions, so it identifies the delegate for replay checks.
  const id = createHash("sha256").update(Buffer.from(sig)).digest("hex");
  return { sd, id, senderId: da.senderId, publicKey: `ed25519:${baseEncode(Uint8Array.from(pk))}`, method: fc.methodName, args: args as Record<string, string> };
}

/** One raw JSON-RPC query. The failover provider turns "no such key" into a generic error, so the access
 * key is read directly: a `result.error` is an answer (PolicyError), a network or 5xx error tries the next RPC. */
async function rawQuery(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  let last: unknown;
  for (const url of [RPCS[1], RPCS[0], RPCS[2]]) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { result?: Record<string, unknown>; error?: { cause?: { name?: string }; message?: string } };
      if (j.error?.cause?.name === "UNKNOWN_ACCESS_KEY" || j.error?.cause?.name === "UNKNOWN_ACCOUNT") throw new PolicyError(String(j.error.cause.name));
      if (j.error) throw new Error(j.error.message ?? "rpc error");
      if (typeof j.result?.error === "string") throw new PolicyError(j.result.error);
      return j.result ?? {};
    } catch (e) {
      if (e instanceof PolicyError) throw e;
      last = e;
    }
  }
  throw last;
}

type AccountView = { recovery: string | null; pending_recovery: [string, string] | null; locked: boolean };
type TransferView = { from: string; status: string; unlock_at: string; frozen_until: string | null; dispute: { opened_at: string } | null };

/** Refuse what the chain would reject anyway. Throws PolicyError for a refusal; RPC errors propagate as outages. */
export async function precheck({ sd, senderId, publicKey, method, args }: Checked) {
  const da = sd.delegateAction;
  let ak: { nonce: number | string; permission: unknown };
  try {
    // Optimistic: a nonce only goes up, and "final" still lags a delegate relayed a few seconds ago.
    ak = (await rawQuery({ request_type: "view_access_key", finality: "optimistic", account_id: senderId, public_key: publicKey })) as typeof ak;
  } catch (e) {
    if (e instanceof PolicyError) throw new PolicyError(`${senderId} has no such access key`);
    throw e;
  }
  if (BigInt(da.nonce) <= BigInt(ak.nonce)) throw new PolicyError("delegate nonce already used");
  const fcPerm = (ak.permission as { FunctionCall?: { receiver_id: string; method_names: string[] } })?.FunctionCall;
  if (fcPerm && (fcPerm.receiver_id !== UNDO || (fcPerm.method_names.length > 0 && !fcPerm.method_names.includes(method)))) {
    throw new PolicyError("the access key may not call this method");
  }
  const block = (await provider.viewBlock({ finality: "final" })) as { header: { height: number | bigint } };
  if (BigInt(da.maxBlockHeight) <= BigInt(block.header.height)) throw new PolicyError("delegate expired");

  // 2 s margins for block time, always on the side the contract will accept.
  const pastNs = BigInt(Date.now() - 2000) * 1_000_000n;
  const soonNs = BigInt(Date.now() + 2000) * 1_000_000n;
  const acct = (id: string) => view<AccountView>(UNDO, "get_account", { account_id: id });
  const transfer = async () => {
    const t = await view<TransferView | null>(UNDO, "get_transfer", { transfer_id: args.transfer_id });
    if (!t) throw new PolicyError(`no transfer ${args.transfer_id}`);
    return t;
  };
  if (method === "panic" || method === "unlock") {
    const a = await acct(args.account_id);
    if (a.recovery !== senderId) throw new PolicyError(`only the recovery account of ${args.account_id} can call ${method}`);
    if (method === "unlock" && !a.locked) throw new PolicyError("account is not locked");
  } else if (method === "cancel_contact") {
    const a = await acct(args.account_id);
    if (a.recovery !== senderId) throw new PolicyError(`only the recovery account of ${args.account_id} can cancel a contact`);
    const list = await view<{ contact: string }[]>(UNDO, "get_contacts", { account_id: args.account_id });
    if (!list.some((c) => c.contact === args.contact_id)) throw new PolicyError("not a contact");
  } else if (method === "cancel_recovery_change") {
    const a = await acct(args.account_id);
    if (!a.pending_recovery) throw new PolicyError("no scheduled change");
    if ((a.recovery ?? args.account_id) !== senderId) throw new PolicyError("only the current recovery account can cancel");
  } else if (method === "release") {
    const t = await transfer();
    if ((await acct(t.from)).recovery !== senderId) throw new PolicyError("only the sender's recovery account can release early");
    if (t.status !== "Pending" || BigInt(t.unlock_at) <= soonNs) throw new PolicyError("only pending payments inside the window");
  } else if (method === "finalize") {
    const t = await transfer();
    if (t.status !== "Frozen") throw new PolicyError("transfer is not frozen");
    if (!t.frozen_until || BigInt(t.frozen_until) > pastNs) throw new PolicyError("the contest window is still open");
  } else if (method === "release_expired") {
    const t = await transfer();
    if (t.status !== "Disputed" || !t.dispute) throw new PolicyError("transfer is not disputed");
    const cfg = await view<{ dispute_timeout_sec: number }>(UNDO, "get_config");
    if (BigInt(t.dispute.opened_at) + BigInt(cfg.dispute_timeout_sec) * 1_000_000_000n > pastNs) throw new PolicyError("the council still has time");
  }
}

/** Delegates already submitted (or in flight), so an immediate replay is refused before it costs gas. */
const seen = new Map<string, number>();
export function claimDelegate(id: string) {
  const now = Date.now();
  for (const [k, until] of seen) if (until < now) seen.delete(k);
  if (seen.has(id)) return false;
  seen.set(id, now + 15 * 60_000);
  return true;
}

let windowStart = Date.now();
let total = 0;
const perSender = new Map<string, number>();
/** In-memory limits per server instance (testnet demo). Signatures and access keys are verified first,
 * so a sender id cannot be forged to dodge the per-sender limit. */
export function takeQuota(senderId: string) {
  if (Date.now() - windowStart > 3_600_000) {
    windowStart = Date.now();
    total = 0;
    perSender.clear();
  }
  const n = (perSender.get(senderId) ?? 0) + 1;
  if (total + 1 > GLOBAL_PER_HOUR || n > SENDER_PER_HOUR) return false;
  total += 1;
  perSender.set(senderId, n);
  return true;
}

/** The relayer pays the gas. Defaults to the demo faucet account; RELAYER_ID / RELAYER_PRIVATE_KEY override it. */
function relayerAccount() {
  const id = optional("RELAYER_ID") ?? optional("NEAR_UNDO_FAUCET_ID") ?? need("NEAR_S21_CONTRACT_ID");
  const key = optional("RELAYER_PRIVATE_KEY") ?? optional("NEAR_UNDO_FAUCET_PRIVATE_KEY") ?? need("NEAR_S21_CONTRACT_PRIVATE_KEY");
  return new Account(id, provider, key as `ed25519:${string}`);
}

/** A short message for a failed relay: the contract's panic text, or the protocol error's name. */
function readable(failure: unknown) {
  const s = JSON.stringify(failure);
  const panicked = s.match(/panicked: ([^"\\]+)/)?.[1];
  if (panicked) return panicked.slice(0, 220);
  const known: Record<string, string> = {
    DelegateActionInvalidNonce: "delegate nonce already used",
    DelegateActionExpired: "delegate expired",
    DelegateActionInvalidSignature: "invalid signature",
    DelegateActionAccessKeyError: "the access key may not call this method",
  };
  for (const [k, v] of Object.entries(known)) if (s.includes(k)) return v;
  const kind = s.match(/"kind":\{"([A-Za-z]+)"/)?.[1];
  return kind ? `transaction failed: ${kind}` : "transaction failed";
}

type Status = { SuccessValue?: string; Failure?: unknown } | string;
type Outcome = { transaction: { hash: string }; status: Status; receipts_outcome?: { outcome: { executor_id?: string; status: Status } }[] };

export async function relay(c: Checked): Promise<{ ok: boolean; hash?: string; value?: unknown; error?: string; relayer: string }> {
  const relayer = relayerAccount();
  const r = (await relayer.signAndSendTransaction({
    receiverId: c.senderId,
    actions: [actions.signedDelegate(c.sd as never)],
    throwOnFailure: false,
  })) as unknown as Outcome;
  const receipts = r.receipts_outcome ?? [];
  // A failed inner call hides in a receipt, so check every outcome, not only the top-level status.
  const failed = [r.status, ...receipts.map((o) => o.outcome.status)].find((s) => typeof s === "object" && s.Failure);
  if (failed && typeof failed === "object") return { ok: false, hash: r.transaction.hash, error: readable(failed.Failure), relayer: relayer.accountId };
  // The top-level status belongs to the Delegate receipt (empty); the contract's return value is in its own receipt.
  const own = receipts.find((o) => o.outcome.executor_id === UNDO && typeof o.outcome.status === "object" && o.outcome.status.SuccessValue !== undefined);
  const sv = own && typeof own.outcome.status === "object" ? own.outcome.status.SuccessValue : undefined;
  let value: unknown;
  if (sv) {
    const s = Buffer.from(sv, "base64").toString();
    try {
      value = JSON.parse(s);
    } catch {
      value = s;
    }
  }
  return { ok: true, hash: r.transaction.hash, value, relayer: relayer.accountId };
}
