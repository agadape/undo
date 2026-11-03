// S13 — deploy our own NEP-141 / NEP-171 / NEP-245 contracts (built in WSL with cargo-near)
// to fresh faucet accounts, then exercise mint / transfer / views from the main account.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Account, KeyPair, actions, teraToGas, nearToYocto, yoctoToNear } from "near-api-js";
import { account, accountId, provider, txSummary, json, sleep } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const envPath = path.join(root, ".env");
const AGENT = `agent.${accountId}`;
const errMsg = (e) => (e?.type ? e.type + ": " : "") + (e?.message ?? String(e)).slice(0, 300);
const view = (contractId, method, args = {}) => provider.callFunction({ contractId, method, args, blockQuery: { finality: "optimistic" } });
const call = (contractId, method, args, deposit = 0n, gas = "50") =>
  account.signAndSendTransaction({ receiverId: contractId, actions: [actions.functionCall(method, args, teraToGas(gas), deposit)] });
const results = [];
async function step(label, fn) {
  try {
    const r = await fn();
    const s = r?.transaction ? txSummary(label, r) : (console.log(label, "->", json(r).slice(0, 700)), null);
    results.push({ label, ok: s ? s.ok : true, hash: s?.hash });
    return r;
  } catch (e) {
    console.log(`[ERR] ${label}: ${errMsg(e)}`);
    results.push({ label, ok: false, error: errMsg(e) });
  }
}

async function faucetAccount(tag) {
  const key = `NEAR_${tag.toUpperCase()}_CONTRACT`;
  const env = fs.readFileSync(envPath, "utf8");
  const existing = env.match(new RegExp(`^${key}_ID=(.+)$`, "m"));
  if (existing) {
    const pk = env.match(new RegExp(`^${key}_PRIVATE_KEY=(.+)$`, "m"))[1].trim();
    return new Account(existing[1].trim(), provider, pk);
  }
  const kp = KeyPair.fromRandom("ed25519");
  const id = `nh-${tag}-${Date.now().toString(36)}.testnet`;
  const res = await fetch("https://helper.nearprotocol.com/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }),
  });
  if (!res.ok) throw new Error(`faucet ${res.status}: ${(await res.text()).slice(0, 200)}`);
  fs.appendFileSync(envPath, `${key}_ID=${id}\n${key}_PRIVATE_KEY=${kp.toString()}\n`);
  console.log("faucet account created:", id);
  for (let i = 0; i < 10; i++) { try { await provider.viewAccount({ accountId: id }); break; } catch { await sleep(1500); } }
  return new Account(id, provider, kp.toString());
}

async function deploy(tag, wasmName) {
  const wasm = fs.readFileSync(path.join(here, "contracts", "wasm", wasmName));
  const c = await faucetAccount(tag);
  console.log(`\n===== ${tag}: ${wasmName} (${wasm.length} bytes) -> ${c.accountId}`);
  const st = await provider.viewAccount({ accountId: c.accountId });
  if (st.code_hash === "11111111111111111111111111111111") {
    const r = await c.signAndSendTransaction({
      receiverId: c.accountId,
      actions: [actions.deployContract(new Uint8Array(wasm)), actions.functionCall("new", {}, teraToGas("100"), 0n)],
    });
    const s = txSummary(`deploy + new (${tag})`, r);
    results.push({ label: `deploy ${tag}`, ok: s.ok, hash: s.hash });
  } else console.log("already deployed, code_hash", st.code_hash);
  const after = await provider.viewAccount({ accountId: c.accountId });
  console.log(`${tag} storage: ${after.storage_usage} bytes (~${(after.storage_usage / 1e5).toFixed(2)} NEAR locked), balance ${yoctoToNear(after.amount, 3)} NEAR`);
  return c.accountId;
}

// ---------- NEP-141 ----------
const FT = await deploy("ft", "spike_ft.wasm");
await step("ft_metadata", () => view(FT, "ft_metadata"));
const ftBounds = await step("storage_balance_bounds (ft)", () => view(FT, "storage_balance_bounds"));
const ftMin = BigInt(ftBounds?.min ?? nearToYocto("0.01"));
await step("storage_deposit me (ft)", () => call(FT, "storage_deposit", { account_id: accountId }, ftMin));
await step("storage_deposit agent (ft)", () => call(FT, "storage_deposit", { account_id: AGENT }, ftMin));
await step("mint 1000 SPIKE", () => call(FT, "mint", { amount: (1000n * 10n ** 6n).toString() }));
await step("ft_transfer 25 SPIKE -> agent", () => call(FT, "ft_transfer", { receiver_id: AGENT, amount: (25n * 10n ** 6n).toString(), memo: "s13" }, 1n));
await sleep(1000);
await step("ft_balance_of me / agent / total", async () => ({ me: await view(FT, "ft_balance_of", { account_id: accountId }), agent: await view(FT, "ft_balance_of", { account_id: AGENT }), total: await view(FT, "ft_total_supply") }));

// ---------- NEP-171 ----------
const NFT = await deploy("nft", "spike_nft.wasm");
await step("nft_metadata", () => view(NFT, "nft_metadata"));
await step("storage_deposit me (nft, 0.05)", () => call(NFT, "storage_deposit", { account_id: accountId }, nearToYocto("0.05")));
await step("storage_deposit agent (nft, 0.05)", () => call(NFT, "storage_deposit", { account_id: AGENT }, nearToYocto("0.05")));
const tokenId = `spike-${Date.now().toString(36)}`;
await step(`mint NFT ${tokenId}`, () => call(NFT, "mint", { token_id: tokenId, title: "Spike Badge #1" }, 0n, "100"));
await step("nft_transfer -> agent", () => call(NFT, "nft_transfer", { receiver_id: AGENT, token_id: tokenId, memo: "s13" }, 1n, "100"));
await sleep(1000);
await step("nft_token", () => view(NFT, "nft_token", { token_id: tokenId }));
await step("nft_tokens_for_owner(agent) [NEP-181]", () => view(NFT, "nft_tokens_for_owner", { account_id: AGENT }));

// ---------- NEP-245 ----------
const MT = await deploy("mt", "spike_mt.wasm");
await step("mt_metadata_contract", () => view(MT, "mt_metadata_contract"));
await step("storage_deposit me (mt, 0.05)", () => call(MT, "storage_deposit", { account_id: accountId }, nearToYocto("0.05")));
await step("storage_deposit agent (mt, 0.05)", () => call(MT, "storage_deposit", { account_id: AGENT }, nearToYocto("0.05")));
await step("mint 100 gold", () => call(MT, "mint", { token_id: "gold", amount: "100" }, 0n, "100"));
await step("mint 1 sword", () => call(MT, "mint", { token_id: "sword", amount: "1" }, 0n, "100"));
await step("mt_transfer 10 gold -> agent", () => call(MT, "mt_transfer", { receiver_id: AGENT, token_id: "gold", amount: "10", memo: "s13" }, 1n, "100"));
await step("mt_batch_transfer gold+sword -> agent", () => call(MT, "mt_batch_transfer", { receiver_id: AGENT, token_ids: ["gold", "sword"], amounts: ["5", "1"], memo: "s13 batch" }, 1n, "100"));
await sleep(1000);
await step("mt_batch_balance_of(agent)", () => view(MT, "mt_batch_balance_of", { account_id: AGENT, token_ids: ["gold", "sword"] }));
await step("mt_batch_balance_of(me)", () => view(MT, "mt_batch_balance_of", { account_id: accountId, token_ids: ["gold", "sword"] }));
await step("mt_supply(gold)", () => view(MT, "mt_supply", { token_id: "gold" }));

console.log("\n=== S13 summary ===");
for (const r of results) console.log(`${r.ok ? "OK  " : "FAIL"} | ${r.label}${r.hash ? " | " + r.hash : ""}${r.error ? " | " + r.error : ""}`);
console.log(json({ FT, NFT, MT }));
