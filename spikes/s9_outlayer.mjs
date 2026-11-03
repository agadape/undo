// S9 — OutLayer on testnet: estimate cost, then run a published wasm (Ethereum API Oracle example)
// via request_execution (yield/resume) and read the result back in the same NEAR tx.
import { actions, teraToGas, nearToYocto, yoctoToNear } from "near-api-js";
import { account, provider, txSummary, json } from "./lib.mjs";

const OUTLAYER = "outlayer.testnet";
const source = {
  WasmUrl: {
    url: "https://wasmhub.testnet.fastfs.io/fastfs.testnet/34907feceac091ba89f167a5cd408ebf6a6758b6ed1bde63020071788f722a35.wasm",
    hash: "34907feceac091ba89f167a5cd408ebf6a6758b6ed1bde63020071788f722a35",
    build_target: "wasm32-wasip2",
  },
};
const resource_limits = { max_instructions: 100000000, max_memory_mb: 128, max_execution_seconds: 60 };
const input = {
  requests: [
    {
      id: "alchemy",
      sources: [
        {
          name: "custom",
          custom: {
            url: "https://eth-mainnet.g.alchemy.com/v2",
            method: "POST",
            body: { method: "eth_getBalance", params: ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "latest"], id: 1, jsonrpc: "2.0" },
            json_path: "result",
            value_type: "string",
          },
        },
      ],
    },
  ],
  max_price_deviation_percent: 10.0,
};

// 1) Cost estimate (view)
for (const args of [{ resource_limits }, { source, resource_limits }, {}]) {
  try {
    const est = await provider.callFunction({ contractId: OUTLAYER, method: "estimate_execution_cost", args });
    console.log("estimate_execution_cost", Object.keys(args), "->", json(est), typeof est === "string" || typeof est === "number" ? `(${yoctoToNear(BigInt(est), 6)} NEAR)` : "");
    break;
  } catch (e) {
    console.log("estimate_execution_cost", Object.keys(args), "ERR:", e.message.slice(0, 200));
  }
}

// 2) Real execution
const before = await account.getBalance();
const t0 = Date.now();
try {
  const res = await account.signAndSendTransaction({
    receiverId: OUTLAYER,
    actions: [
      actions.functionCall(
        "request_execution",
        {
          source,
          secrets_ref: { profile: "alchemy", account_id: "zavodil2.testnet" },
          resource_limits,
          input_data: JSON.stringify(input),
        },
        teraToGas("300"),
        nearToYocto("0.1"),
      ),
    ],
  });
  const ms = Date.now() - t0;
  const s = txSummary("outlayer request_execution", res);
  console.log("end-to-end latency ms:", ms);
  const after = await account.getBalance();
  console.log("net cost (incl. gas, after refund):", yoctoToNear(before - after, 6), "NEAR");
  if (s.successValue) {
    try { console.log("decoded result:", json(JSON.parse(s.successValue))); } catch { console.log("raw result:", s.successValue.slice(0, 1000)); }
  }
} catch (e) {
  console.log("request_execution failed after", Date.now() - t0, "ms:", (e.type ? e.type + ": " : "") + e.message.slice(0, 600));
}
