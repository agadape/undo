// S6a — NEAR Intents 1Click: dry quotes only (dry:true executes nothing, moves no funds).
const API = "https://1click.chaindefuser.com/v0";
const tokens = await (await fetch(`${API}/tokens`)).json();
const find = (chain, sym) => tokens.find((t) => t.blockchain === chain && t.symbol === sym);
const WNEAR = find("near", "wNEAR");
const USDC_NEAR = find("near", "USDC");
const USDC_BASE = find("base", "USDC");
const refundTo = process.argv[2] ?? "nh-spike-placeholder.near"; // dry run: never used
const amount = (10n ** 23n).toString(); // 0.1 NEAR

async function quote(label, body) {
  const t0 = Date.now();
  const res = await fetch(`${API}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const ms = Date.now() - t0;
  const j = await res.json();
  console.log(`\n=== ${label}: HTTP ${res.status} in ${ms} ms`);
  if (!res.ok) { console.log(JSON.stringify(j).slice(0, 600)); return; }
  const q = j.quote ?? {};
  const inUsd = Number(q.amountInUsd ?? 0), outUsd = Number(q.amountOutUsd ?? 0);
  console.log(JSON.stringify({
    amountIn: q.amountInFormatted, amountOut: q.amountOutFormatted, minAmountOut: q.minAmountOut,
    amountInUsd: q.amountInUsd, amountOutUsd: q.amountOutUsd,
    implicitCostPct: inUsd ? (((inUsd - outUsd) / inUsd) * 100).toFixed(2) + "%" : undefined,
    timeEstimateSec: q.timeEstimate, depositAddress: q.depositAddress ?? "(none — dry)", deadline: q.deadline,
    signaturePresent: Boolean(j.signature), topKeys: Object.keys(j), quoteKeys: Object.keys(q),
  }, null, 2));
}

const base = { dry: true, swapType: "EXACT_INPUT", slippageTolerance: 100, originAsset: WNEAR.assetId, depositType: "ORIGIN_CHAIN", amount, refundTo, refundType: "ORIGIN_CHAIN", deadline: new Date(Date.now() + 10 * 60 * 1000).toISOString() };
await quote("0.1 NEAR -> USDC on NEAR", { ...base, destinationAsset: USDC_NEAR.assetId, recipient: refundTo, recipientType: "DESTINATION_CHAIN" });
await quote("0.1 NEAR -> USDC on Base (to Chain-Signatures-derived EVM address from S4)", { ...base, destinationAsset: USDC_BASE.assetId, recipient: "0x2a01699F048133Dce1035DDfBcA7f423f39D566B", recipientType: "DESTINATION_CHAIN" });
await quote("unhappy: 0.0001 NEAR (dust) -> USDC on Base", { ...base, amount: (10n ** 20n).toString(), destinationAsset: USDC_BASE.assetId, recipient: "0x2a01699F048133Dce1035DDfBcA7f423f39D566B", recipientType: "DESTINATION_CHAIN" });
