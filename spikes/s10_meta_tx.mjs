// S10 — NEP-366 meta-transactions with our own relayer.
// A near-empty "user" account pays a merchant 3 USDC; the relayer (main account) pays all gas.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Account, KeyPair, actions, teraToGas, nearToYocto, yoctoToNear } from "near-api-js";
import { account as relayer, accountId, provider, txSummary, json, sleep } from "./lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USDC = "usdc.fakes.testnet";
const MERCHANT = `agent.${accountId}`;
const userId = `user.${accountId}`;
const u = (x) => BigInt(Math.round(x * 1e6)).toString();
const usdc = (who) => provider.callFunction({ contractId: USDC, method: "ft_balance_of", args: { account_id: who }, blockQuery: { finality: "optimistic" } });
const nearBal = async (who) => BigInt((await provider.viewAccount({ accountId: who, blockQuery: { finality: "optimistic" } })).amount);
const errMsg = (e) => (e?.type ? e.type + ": " : "") + (e?.message ?? String(e)).slice(0, 220);
const out = {};

// 1) A user account with almost no NEAR (just storage)
let userKey;
const envTxt = fs.readFileSync(path.join(root, ".env"), "utf8");
const m = envTxt.match(/^NEAR_USER_PRIVATE_KEY=(.+)$/m);
if (m) userKey = KeyPair.fromString(m[1].trim());
else {
  userKey = KeyPair.fromRandom("ed25519");
  txSummary("create user sub-account (0.003 NEAR)", await relayer.createSubAccount({ accountOrPrefix: "user", publicKey: userKey.getPublicKey(), nearToTransfer: nearToYocto("0.003") }));
  fs.appendFileSync(path.join(root, ".env"), `NEAR_USER_ACCOUNT_ID=${userId}\nNEAR_USER_PRIVATE_KEY=${userKey.toString()}\n`);
}
const user = new Account(userId, provider, userKey.toString());

// 2) Relayer sponsors the user's USDC storage and sends them 20 USDC
const reg = await provider.callFunction({ contractId: USDC, method: "storage_balance_of", args: { account_id: userId } });
if (!reg) txSummary("relayer pays USDC storage for user", await relayer.signAndSendTransaction({ receiverId: USDC, actions: [actions.functionCall("storage_deposit", { account_id: userId, registration_only: true }, teraToGas("30"), nearToYocto("0.00125"))] }));
txSummary("fund user 20 USDC", await relayer.signAndSendTransaction({ receiverId: USDC, actions: [actions.functionCall("ft_transfer", { receiver_id: userId, amount: u(20) }, teraToGas("30"), 1n)] }));
await sleep(1200);

const before = { userNear: await nearBal(userId), relayerNear: await nearBal(accountId), userUsdc: await usdc(userId), merchantUsdc: await usdc(MERCHANT) };
console.log("before:", json({ userNear: yoctoToNear(before.userNear, 6), userUsdc: before.userUsdc, merchantUsdc: before.merchantUsdc }));

// 3) User signs a delegate action OFFLINE (no tx sent by the user)
const payAction = actions.functionCall("ft_transfer", { receiver_id: MERCHANT, amount: u(3), memo: "coffee #42 (gasless)" }, teraToGas("30"), 1n);
const signedRes = await user.createSignedMetaTransaction({ receiverId: USDC, actions: [payAction], blockHeightTtl: 120 });
const signedDelegate = Array.isArray(signedRes) ? signedRes[1] : signedRes.signedDelegateAction ?? signedRes.signedDelegate ?? signedRes;
console.log("signed delegate keys:", Object.keys(signedRes), "| nonce:", String(signedDelegate?.delegateAction?.nonce), "| maxBlockHeight:", String(signedDelegate?.delegateAction?.maxBlockHeight));

// 4) Relayer submits it and pays gas
const t0 = Date.now();
const relayRes = await relayer.signAndSendTransaction({ receiverId: userId, actions: [actions.signedDelegate(signedDelegate)] });
out.relay = txSummary("relayer submits user's signed delegate (ft_transfer 3 USDC)", relayRes);
out.relayMs = Date.now() - t0;
await sleep(1500);
const after = { userNear: await nearBal(userId), relayerNear: await nearBal(accountId), userUsdc: await usdc(userId), merchantUsdc: await usdc(MERCHANT) };
out.userNearDeltaYocto = (after.userNear - before.userNear).toString();
out.relayerNearDelta = yoctoToNear(after.relayerNear - before.relayerNear, 6);
out.userUsdc = `${before.userUsdc} -> ${after.userUsdc}`;
out.merchantUsdc = `${before.merchantUsdc} -> ${after.merchantUsdc}`;
console.log("after:", json(out));

// 5) Unhappy: replay the same signed delegate
try {
  const r = await relayer.signAndSendTransaction({ receiverId: userId, actions: [actions.signedDelegate(signedDelegate)] });
  out.replay = txSummary("replay same signed delegate", r);
} catch (e) { out.replay = errMsg(e); console.log("replay rejected:", out.replay); }

// 6) Unhappy: expired delegate (TTL 1 block, submit after a few blocks)
const shortRes = await user.createSignedMetaTransaction({ receiverId: USDC, actions: [payAction], blockHeightTtl: 1 });
const shortDelegate = Array.isArray(shortRes) ? shortRes[1] : shortRes.signedDelegateAction ?? shortRes.signedDelegate ?? shortRes;
await sleep(4000);
try {
  const r = await relayer.signAndSendTransaction({ receiverId: userId, actions: [actions.signedDelegate(shortDelegate)] });
  out.expired = txSummary("expired delegate", r);
} catch (e) { out.expired = errMsg(e); console.log("expired rejected:", out.expired); }

// 7) Unhappy: relayer tampers with the receiver (sends to wrong sender account)
try {
  const r = await relayer.signAndSendTransaction({ receiverId: MERCHANT, actions: [actions.signedDelegate(signedDelegate)] });
  out.wrongReceiver = txSummary("delegate wrapped with wrong receiver", r);
} catch (e) { out.wrongReceiver = errMsg(e); console.log("wrong receiver rejected:", out.wrongReceiver); }

console.log("\n=== S10 summary ===\n" + json(out));
