// S3b — basic writes with near-api-js v7: NEAR transfer + contract function call.
import { teraToGas, nearToYocto, yoctoToNear } from "near-api-js";
import { NEAR } from "near-api-js/tokens";
import { account, accountId, provider, txSummary, json } from "./lib.mjs";

const GUESTBOOK = "guestbook.near-examples.testnet";

console.log("account:", accountId);
console.log("balance before:", yoctoToNear(await account.getBalance(), 4), "NEAR");

// 1) Self-transfer (proves signing + nonce handling)
const t0 = Date.now();
const transfer = await account.transfer({
  token: NEAR,
  amount: NEAR.toUnits("0.001"),
  receiverId: accountId,
});
txSummary("transfer 0.001 NEAR to self", transfer);
console.log("latency ms:", Date.now() - t0);

// 2) Function call on a public example contract
const t1 = Date.now();
const call = await account.callFunction({
  contractId: GUESTBOOK,
  methodName: "add_message",
  args: { text: `nh-spike S3b ${new Date().toISOString()}` },
  gas: teraToGas("30"),
  deposit: nearToYocto("0"),
});
console.log("callFunction return:", json(call));
console.log("latency ms:", Date.now() - t1);

// 3) Read back
const total = await provider.callFunction({ contractId: GUESTBOOK, method: "total_messages", args: {} });
const last = await provider.callFunction({
  contractId: GUESTBOOK,
  method: "get_messages",
  args: { from_index: String(Math.max(0, Number(total) - 1)), limit: "1" },
});
console.log("total_messages:", total, "last:", json(last));
console.log("balance after:", yoctoToNear(await account.getBalance(), 4), "NEAR");
