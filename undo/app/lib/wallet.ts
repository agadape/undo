// NEAR Connect (@hot-labs/near-connect) — real wallets on testnet. Browser-only: the connector uses
// window, localStorage and IndexedDB, so it is imported lazily and never during server render.
import type { NearConnector } from "@hot-labs/near-connect";
import { RPCS } from "./config";

let connectorP: Promise<NearConnector> | null = null;

export function getConnector(): Promise<NearConnector> {
  if (typeof window === "undefined") return Promise.reject(new Error("wallets are browser-only"));
  if (!connectorP) {
    connectorP = (async () => {
      const { NearConnector } = await import("@hot-labs/near-connect");
      const c = new NearConnector({
        network: "testnet",
        providers: { testnet: RPCS },
        features: { testnet: true, signAndSendTransaction: true },
      });
      await c.whenManifestLoaded;
      return c;
    })();
  }
  return connectorP;
}

type Outcome = { transaction: { hash: string }; status: { SuccessValue?: string; Failure?: unknown } | string };

/** Ask the connected wallet to sign and send one function call. */
export async function walletFunctionCall(receiverId: string, method: string, args: Record<string, unknown>, deposit: bigint, gasTera: number): Promise<Outcome> {
  const c = await getConnector();
  const wallet = await c.wallet();
  return (await wallet.signAndSendTransaction({
    receiverId,
    actions: [{ type: "FunctionCall", params: { methodName: method, args, gas: (BigInt(gasTera) * 10n ** 12n).toString(), deposit: deposit.toString() } }],
  })) as unknown as Outcome;
}

/** Several function calls to ONE receiver in a single transaction (one wallet approval). */
export async function walletBatch(receiverId: string, calls: { method: string; args: Record<string, unknown>; deposit: bigint; gasTera: number }[]): Promise<Outcome> {
  const c = await getConnector();
  const wallet = await c.wallet();
  return (await wallet.signAndSendTransaction({
    receiverId,
    actions: calls.map((x) => ({ type: "FunctionCall" as const, params: { methodName: x.method, args: x.args, gas: (BigInt(x.gasTera) * 10n ** 12n).toString(), deposit: x.deposit.toString() } })),
  })) as unknown as Outcome;
}
