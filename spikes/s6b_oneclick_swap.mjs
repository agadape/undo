// S6b — real NEAR Intents 1Click swap on MAINNET. This script never signs or sends funds:
// the human sends NEAR from their own wallet to the deposit address; the script only quotes and watches.
//   node s6b_oneclick_swap.mjs quote <your-account.near> [amountNear=0.1]
//   node s6b_oneclick_swap.mjs submit <txHash>      (optional, speeds up detection)
//   node s6b_oneclick_swap.mjs watch                (polls status until it settles)
import fs from "node:fs";

const API = "https://1click.chaindefuser.com/v0";
const RPC = "https://rpc.mainnet.fastnear.com";
const USDC_NEAR = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const STATE = "out/s6b_quote.json";
const [mode, arg1, arg2] = process.argv.slice(2);

async function accountExists(id) {
  const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_account", finality: "final", account_id: id } }) });
  const j = await r.json();
  return j.result ? j.result : null;
}

if (mode === "quote") {
  const account = arg1;
  if (!account || !account.endsWith(".near") && !/^[0-9a-f]{64}$/.test(account)) throw new Error("usage: quote <your-account.near> [amountNear]");
  const view = await accountExists(account);
  if (!view) throw new Error(`${account} does not exist on mainnet (1Click returns an opaque 400 for this)`);
  console.log(`${account}: ${(Number(BigInt(view.amount) / 10n ** 18n) / 1e6).toFixed(4)} NEAR on mainnet`);
  const amountNear = Number(arg2 ?? "0.1");
  const amount = (BigInt(Math.round(amountNear * 1e6)) * 10n ** 18n).toString();
  const body = {
    dry: false, swapType: "EXACT_INPUT", slippageTolerance: 100,
    originAsset: "nep141:wrap.near", depositType: "ORIGIN_CHAIN", amount,
    destinationAsset: USDC_NEAR, recipient: account, recipientType: "DESTINATION_CHAIN",
    refundTo: account, refundType: "ORIGIN_CHAIN",
    deadline: new Date(Date.now() + 20 * 60 * 1000).toISOString(), quoteWaitingTimeMs: 3000,
  };
  const res = await fetch(`${API}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) throw new Error(`quote HTTP ${res.status}: ${JSON.stringify(j).slice(0, 400)}`);
  fs.writeFileSync(STATE, JSON.stringify({ requestedAt: new Date().toISOString(), account, ...j }, null, 2));
  const q = j.quote;
  console.log(`
QUOTE (signed by 1Click: ${Boolean(j.signature)})
  send exactly : ${q.amountInFormatted} NEAR  (minimum ${Number(q.minAmountIn) / 1e24})
  to address   : ${q.depositAddress}
  you receive  : ~${q.amountOutFormatted} USDC on NEAR (min ${Number(q.minAmountOut) / 1e6}) at ${account}
  value in/out : $${Number(q.amountInUsd).toFixed(4)} -> $${Number(q.amountOutUsd).toFixed(4)}
  deadline     : ${q.deadline}  (send before this, otherwise it is refunded)
  ETA          : ~${q.timeEstimate}s after the deposit lands
Saved to ${STATE}. After sending, run: node s6b_oneclick_swap.mjs watch`);
} else if (mode === "submit") {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
  const r = await fetch(`${API}/deposit/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ depositAddress: st.quote.depositAddress, txHash: arg1 }) });
  console.log("deposit/submit HTTP", r.status, (await r.text()).slice(0, 400));
} else if (mode === "watch") {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
  const addr = arg1 ?? st.quote.depositAddress;
  let last = "", t0 = Date.now();
  const timeline = [];
  for (let i = 0; i < 240; i++) {
    const r = await fetch(`${API}/status?depositAddress=${encodeURIComponent(addr)}`);
    const j = await r.json();
    if (j.status !== last) {
      last = j.status;
      timeline.push({ status: j.status, at: new Date().toISOString(), sinceStartSec: Math.round((Date.now() - t0) / 1000) });
      console.log(`[${new Date().toISOString()}] ${j.status}`);
    }
    if (["SUCCESS", "REFUNDED", "FAILED", "INCOMPLETE_DEPOSIT"].includes(j.status)) {
      fs.writeFileSync("out/s6b_status_final.json", JSON.stringify({ timeline, final: j }, null, 2));
      const d = j.swapDetails ?? {};
      console.log(JSON.stringify({
        status: j.status,
        amountIn: d.amountInFormatted, amountOut: d.amountOutFormatted, refunded: d.refundedAmountFormatted,
        originTxs: (d.originChainTxHashes ?? []).map((t) => t.hash ?? t), destTxs: (d.destinationChainTxHashes ?? []).map((t) => t.hash ?? t),
        intentHashes: d.intentHashes, explorer: `https://explorer.near-intents.org/?search=${addr}`,
      }, null, 2));
      break;
    }
    await new Promise((ok) => setTimeout(ok, 5000));
  }
} else {
  console.log("usage: quote <account.near> [amountNear] | submit <txHash> | watch");
}
