// Browser-side NEAR helpers. Two kinds of signer:
// - "demo": throwaway testnet accounts whose keys live in this browser's localStorage;
// - "wallet": a real wallet connected through NEAR Connect (it signs; we never see its key).
// Never use this for real money.
import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPair, actions, teraToGas } from "near-api-js";
import { RPCS } from "./config";
import { walletFunctionCall } from "./wallet";

export const provider = new FailoverRpcProvider(RPCS.map((url) => new JsonRpcProvider({ url })));

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

export async function view<T = unknown>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  return (await provider.callFunction({ contractId, method, args })) as T;
}

export type CallResult = { ok: boolean; hash?: string; value?: unknown; error?: string };

function cleanError(e: unknown): string {
  const s = String((e as { message?: string })?.message ?? e);
  const m = s.match(/panicked: ([^"\\]+)/) ?? s.match(/ExecutionError\W+([^"\\]+)/);
  return (m ? m[1] : s).slice(0, 220);
}

type Outcome = { transaction: { hash: string }; status: { SuccessValue?: string; Failure?: unknown } | string };

/** Sign and send one function call — from a demo account (local key) or the connected wallet. */
export async function call(
  who: DemoAccount,
  receiverId: string,
  method: string,
  args: Record<string, unknown>,
  opts: { deposit?: bigint; gasTera?: string } = {},
): Promise<CallResult> {
  try {
    const gas = Number(opts.gasTera ?? "100");
    const r: Outcome =
      who.kind === "wallet"
        ? await walletFunctionCall(receiverId, method, args, opts.deposit ?? 0n, gas)
        : ((await new Account(who.id, provider, who.key as `ed25519:${string}`).signAndSendTransaction({
            receiverId,
            actions: [actions.functionCall(method, args, teraToGas(gas), opts.deposit ?? 0n)],
          })) as unknown as Outcome);
    return parseOutcome(r);
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
