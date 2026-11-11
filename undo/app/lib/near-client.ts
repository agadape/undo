// Browser-side NEAR helpers. Two kinds of signer:
// - "demo": throwaway testnet accounts whose keys live in this browser's localStorage;
// - "wallet": a real wallet connected through NEAR Connect (it signs; we never see its key).
// Never use this for real money.
import { Account, FailoverRpcError, FailoverRpcProvider, JsonRpcProvider, KeyPair, actions, encodeSignedDelegate, teraToGas } from "near-api-js";
import { GASLESS_METHODS, RPCS, UNDO } from "./config";
import { walletFunctionCall } from "./wallet";

/** The request never got an answer from an RPC: offline, CORS (a 429 often comes without CORS headers), HTTP 429/5xx,
 * timeout or a rate-limit message. A contract error or "account does not exist" is a real answer and is not this. */
function transportError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  const cause = (e as { cause?: unknown })?.cause;
  if (typeof cause === "number" && [408, 429, 500, 502, 503, 504].includes(cause)) return true;
  return /failed to fetch|networkerror|load failed|fetch failed|too many requests|rate limit|exceeded \d+ attempts|timed? ?out|unavailable|bad gateway/i.test(
    String((e as Error)?.message ?? e),
  );
}

/** Wraps the public failover provider: when every public RPC failed at the network level, the same call is retried
 * once through our server (/api/rpc), whose IP is not the one being rate-limited. Not part of the failover list on
 * purpose: that list sticks to the last endpoint that worked, and this way the server is never the everyday path. */
function withServerFallback<T extends object>(main: T): T {
  if (typeof window === "undefined") return main;
  const backup = new JsonRpcProvider({ url: `${window.location.origin}/api/rpc` }, { retries: 1, wait: 500, backoff: 2 }) as unknown as Record<PropertyKey, unknown>;
  return new Proxy(main, {
    get(target, prop) {
      const fn = Reflect.get(target, prop);
      if (typeof fn !== "function") return fn;
      const alt = backup[prop];
      if (typeof alt !== "function") return fn.bind(target);
      return async (...args: unknown[]) => {
        try {
          return await fn.apply(target, args);
        } catch (e) {
          const errors = e instanceof FailoverRpcError ? e.errors : [e];
          if (!errors.length || !errors.every(transportError)) throw e;
          return await alt.apply(backup, args);
        }
      };
    },
  });
}

// One quick retry per endpoint, then the next one: the library default (12 retries with backoff, also on
// HTTP 429) can hold a single call for minutes and multiplies traffic while an RPC is failing.
export const provider = withServerFallback(new FailoverRpcProvider(RPCS.map((url) => new JsonRpcProvider({ url }, { retries: 1, wait: 300, backoff: 2 }))));

export type DemoAccount = { id: string; key: string; label: string; recoveryFor?: string; kind?: "demo" | "wallet" };
const STORE = "undo.demo.accounts.v1";

export function loadAccounts(): DemoAccount[] {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "[]");
  } catch {
    return [];
  }
}

export function saveAccounts(list: DemoAccount[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(list));
  } catch {
    /* private mode: accounts live only in memory */
  }
}

/** Identical view calls within 2 s share one request: the wallet, the alert and the drill poll the same methods.
 * Cleared after every transaction from this page (chainChanged), so a refresh right after an action reads fresh state. */
const VIEW_TTL_MS = 2000;
const viewCache = new Map<string, { at: number; p: Promise<unknown> }>();

export function view<T = unknown>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  const key = `${contractId}|${method}|${JSON.stringify(args)}`;
  const now = Date.now();
  const hit = viewCache.get(key);
  if (hit && now - hit.at < VIEW_TTL_MS) return hit.p as Promise<T>;
  const p = provider.callFunction({ contractId, method, args });
  viewCache.set(key, { at: now, p });
  p.catch(() => {
    if (viewCache.get(key)?.p === p) viewCache.delete(key);
  });
  if (viewCache.size > 200) for (const [k, v] of viewCache) if (now - v.at >= VIEW_TTL_MS) viewCache.delete(k);
  return p as Promise<T>;
}

/** `gasless`: the Undo relayer paid the gas (NEP-366 meta-transaction); the signer's NEAR did not move. */
export type CallResult = { ok: boolean; hash?: string; value?: unknown; error?: string; gasless?: boolean };

function cleanError(e: unknown): string {
  const s = String((e as { message?: string })?.message ?? e);
  const m = s.match(/panicked: ([^"\\]+)/) ?? s.match(/ExecutionError\W+([^"\\]+)/);
  return (m ? m[1] : s).slice(0, 220);
}

type Outcome = { transaction: { hash: string }; status: { SuccessValue?: string; Failure?: unknown } | string };

/** Reject after `ms` so a hanging RPC or relayer never leaves a button spinning for minutes. */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(what)), ms))]);
}

/** Sign a delegate action and let the Undo relayer pay the gas. null = relayer unavailable (caller falls back). */
async function callGasless(who: DemoAccount, method: string, args: Record<string, unknown>, gas: number): Promise<CallResult | null> {
  let body: string;
  try {
    const { signedDelegate } = await withTimeout(
      new Account(who.id, provider, who.key as `ed25519:${string}`).createSignedMetaTransaction({
        receiverId: UNDO,
        actions: [actions.functionCall(method, args, teraToGas(gas), 0n)],
        blockHeightTtl: 120,
      }),
      20_000,
      "timeout",
    );
    let bin = "";
    encodeSignedDelegate(signedDelegate).forEach((b) => (bin += String.fromCharCode(b)));
    body = JSON.stringify({ signedDelegate: btoa(bin) });
  } catch {
    return null;
  }
  try {
    const res = await fetch("/api/relay", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(60_000) });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; hash?: string; value?: unknown; error?: string };
    // 400 = the policy or the contract's rules refuse it: paying the gas ourselves would fail the same way.
    if (res.status === 400) return { ok: false, error: j.error ?? "refused by the relayer" };
    if (!res.ok || typeof j.ok !== "boolean") return null;
    return { ok: j.ok, hash: j.hash, value: j.value, error: j.error, gasless: true };
  } catch {
    return null;
  }
}

/** Fired on window after every successful call, so watchers (the outgoing-money alert) re-read at once. */
export const CHAIN_EVENT = "undo:chain-changed";
/** The chain changed because of this page (a transaction here, or one our server sent for it): drop cached views
 * and tell the watchers. */
export function chainChanged() {
  viewCache.clear();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHAIN_EVENT));
}
const changed = (r: CallResult): CallResult => {
  if (r.ok) chainChanged();
  return r;
};

/** Sign and send one function call — from a demo account (local key) or the connected wallet.
 * Undo's safety actions from a demo account go gasless through our relayer, with a normal signed call as fallback. */
export async function call(
  who: DemoAccount,
  receiverId: string,
  method: string,
  args: Record<string, unknown>,
  opts: { deposit?: bigint; gasTera?: string } = {},
): Promise<CallResult> {
  try {
    const gas = Number(opts.gasTera ?? "100");
    if (who.kind !== "wallet" && receiverId === UNDO && GASLESS_METHODS.includes(method) && !opts.deposit) {
      const g = await callGasless(who, method, args, gas);
      if (g) return changed(g);
    }
    const r: Outcome =
      who.kind === "wallet"
        ? await walletFunctionCall(receiverId, method, args, opts.deposit ?? 0n, gas)
        : ((await withTimeout(
            new Account(who.id, provider, who.key as `ed25519:${string}`).signAndSendTransaction({
              receiverId,
              actions: [actions.functionCall(method, args, teraToGas(gas), opts.deposit ?? 0n)],
            }),
            90_000,
            "no answer from the RPC after 90 s: check the history before trying again",
          )) as unknown as Outcome);
    return changed(parseOutcome(r));
  } catch (e) {
    return { ok: false, error: cleanError(e) };
  }
}

export function parseOutcome(r: Outcome): CallResult {
  const status = typeof r.status === "object" ? r.status : {};
  if (status.Failure) return { ok: false, hash: r.transaction?.hash, error: cleanError(JSON.stringify(status.Failure)) };
  {
    let value: unknown;
    if (status.SuccessValue) {
      const s = atob(status.SuccessValue);
      try {
        value = JSON.parse(s);
      } catch {
        value = s;
      }
    }
    return { ok: true, hash: r.transaction?.hash, value };
  }
}

/** Create a demo account: key generated here, account created by our server (testnet faucet). */
export async function createDemoAccount(label: string): Promise<DemoAccount> {
  const kp = KeyPair.fromRandom("ed25519");
  const res = await fetch("/api/demo/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicKey: kp.getPublicKey().toString() }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  // Wait until the RPC sees the account.
  for (let i = 0; i < 20; i++) {
    try {
      await provider.viewAccount({ accountId: body.accountId });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return { id: body.accountId, key: kp.toString(), label };
}

export const USD = (n: number) => String(Math.round(n * 1e6));
/** 6-decimal token amount with 2 decimals: "1.234,56" (id) or "1,234.56" (en). In components use useFmt(). */
export const formatAmount = (raw: string | bigint | null | undefined, lang: "id" | "en" = "id") => {
  const v = BigInt(raw ?? 0);
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return lang === "en" ? `${whole.toLocaleString("en-US")}.${frac}` : `${whole.toLocaleString("id-ID")},${frac}`;
};
export const fmt = (raw: string | bigint | null | undefined) => formatAmount(raw, "id");
export const short = (id: string) => (id.length > 26 ? `${id.slice(0, 12)}…${id.slice(-12)}` : id);
