// v2_dev_flow — deploy undo-token v2 (trusted contacts, T0) to a fresh DEV account (not locked) with short
// windows, then run the T0 scenario on testnet and write spikes/out/v2_dev_flow.json.
//   node v2_dev_flow.mjs <path/to/undo_token.wasm>
// Scenario: a new contact waits for contact_delay; then a payment to it is final at once and a send_usdc to
// it can be withdrawn at once; a payment to a non-contact stays pending; a contact payment cannot be
// reported; a contact the "thief" adds is cancelled by panic, the owner's active contact stays.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Account, KeyPair, actions, teraToGas, nearToYocto } from "near-api-js";
import { provider, sleep, EXPLORER } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, "..", ".env");
const wasmPath = process.argv[2];
if (!wasmPath || !fs.existsSync(wasmPath)) {
  console.log("usage: node v2_dev_flow.mjs <path/to/undo_token.wasm>");
  process.exit(1);
}
const USDC = "usdc.fakes.testnet";
const DAO = "nhspike-mvp6a0dx.sputnikv2.testnet";
const CFG = { window_sec: 120, contest_window_sec: 60, evidence_window_sec: 60, dispute_timeout_sec: 600, recovery_delay_sec: 60, contact_delay_sec: 60 };
const FEE = nearToYocto("0.005");
const out = { wasmBytes: fs.statSync(wasmPath).size, steps: {} };
const rand = () => Math.random().toString(36).slice(2, 8);

async function call(acct, receiverId, method, args, deposit = 0n, gas = 100) {
  try {
    const r = await acct.signAndSendTransaction({ receiverId, actions: [actions.functionCall(method, args, teraToGas(gas), deposit)] });
    const sv = r.status?.SuccessValue;
    let value = null;
    if (sv) {
      const s = Buffer.from(sv, "base64").toString();
      try {
        value = JSON.parse(s);
      } catch {
        value = s;
      }
    }
    return { ok: true, hash: r.transaction.hash, value };
  } catch (e) {
    const m = String(e?.message ?? e);
    return { ok: false, error: (m.match(/panicked: ([^"\\]+)/)?.[1] ?? m).slice(0, 200) };
  }
}
const view = (method, args = {}) => provider.callFunction({ contractId: out.contract, method, args, blockQuery: { finality: "optimistic" } });
const step = (name, v) => {
  out.steps[name] = v;
  console.log(name, JSON.stringify(v));
};

// 1) Dev contract account: the testnet helper (10 NEAR), else a sub-account of the S26-real account.
const kp = KeyPair.fromRandom("ed25519");
let id = `undo-v2dev-${rand()}.testnet`;
let viaHelper = false;
try {
  const res = await fetch("https://helper.nearprotocol.com/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }),
    signal: AbortSignal.timeout(15000),
  });
  viaHelper = res.ok;
} catch {}
if (!viaHelper) {
  const parent = new Account(process.env.NEAR_S26_REAL_CONTRACT_ID, provider, process.env.NEAR_S26_REAL_CONTRACT_PRIVATE_KEY);
  const prefix = `v2dev${rand()}`;
  await parent.createSubAccount({ accountOrPrefix: prefix, publicKey: kp.getPublicKey(), nearToTransfer: nearToYocto("4") });
  id = `${prefix}.${parent.accountId}`;
}
for (let i = 0; i < 15; i++) {
  try {
    await provider.viewAccount({ accountId: id });
    break;
  } catch {
    await sleep(2000);
  }
}
fs.appendFileSync(envPath, `NEAR_UNDO_V2DEV_CONTRACT_ID=${id}\nNEAR_UNDO_V2DEV_CONTRACT_PRIVATE_KEY=${kp.toString()}\n`);
out.contract = id;
out.via = viaHelper ? "testnet helper" : "sub-account";
const contract = new Account(id, provider, kp.toString());
console.log("v2 dev contract:", id, `(${out.via})`);

// 2) Deploy + init + register the contract on USDC.
const dep = await contract.signAndSendTransaction({
  receiverId: id,
  actions: [
    actions.deployContract(new Uint8Array(fs.readFileSync(wasmPath))),
    actions.functionCall("new", { underlying: USDC, council: DAO, ...CFG, bond: nearToYocto("0.01").toString(), storage_fee: FEE.toString() }, teraToGas("50"), 0n),
  ],
});
step("deploy", { tx: EXPLORER + dep.transaction.hash });
await call(contract, USDC, "storage_deposit", { account_id: id, registration_only: true }, nearToYocto("0.00125"), 30);
const cfg = await view("get_config");
step("config", { window_sec: cfg.window_sec, contact_delay_sec: cfg.contact_delay_sec, recovery_delay_sec: cfg.recovery_delay_sec });

// 3) People: sub-accounts of the dev contract account.
const people = {};
for (const name of ["alice", "hp", "shop", "thief"]) {
  const k = KeyPair.fromRandom("ed25519");
  await contract.createSubAccount({ accountOrPrefix: name, publicKey: k.getPublicKey(), nearToTransfer: nearToYocto("0.2") });
  people[name] = new Account(`${name}.${id}`, provider, k.toString());
}
const A = people.alice;
for (const p of [A, people.shop]) await call(p, USDC, "storage_deposit", { account_id: p.accountId, registration_only: true }, nearToYocto("0.00125"), 30);

// 4) alice: recovery account first (instant while empty), then wrap 100 USDC.
step("set_recovery", await call(A, id, "set_recovery", { recovery_id: people.hp.accountId }, 0n, 30));
await call(A, USDC, "mint", { account_id: A.accountId, amount: "100000000" }, 0n, 30);
step("wrap", await call(A, USDC, "ft_transfer_call", { receiver_id: id, amount: "100000000", msg: "" }, 1n, 100));

// 5) add shop as a contact; before contact_delay a payment to it is still pending.
const added = await call(A, id, "add_contact", { contact_id: people.shop.accountId }, FEE, 30);
step("add_contact", added);
const early = await call(A, id, "transfer", { receiver_id: people.shop.accountId, amount: "10000000" }, FEE, 50);
step("pay_before_active", { ...early, status: (await view("get_transfer", { transfer_id: String(early.value) }))?.status });

// 6) after contact_delay: final at once.
await sleep((CFG.contact_delay_sec + 5) * 1000);
step("contacts_after_delay", await view("get_contacts", { account_id: A.accountId }));
const shopBefore = await view("balance_of", { account_id: people.shop.accountId });
const instant = await call(A, id, "transfer", { receiver_id: people.shop.accountId, amount: "20000000" }, FEE, 50);
const t1 = await view("get_transfer", { transfer_id: String(instant.value) });
const shopAfter = await view("balance_of", { account_id: people.shop.accountId });
step("pay_active_contact", { ...instant, status: t1?.status, final_to: t1?.final_to, shopAvailableBefore: shopBefore.available, shopAvailableAfter: shopAfter.available });

// 7) a contact payment cannot be reported.
step("report_contact_payment", await call(A, id, "report", { transfer_id: String(instant.value), reason: "test" }, nearToYocto("0.01"), 50));

// 8) send_usdc to the contact: withdrawable at once.
const exit = await call(A, id, "send_usdc", { receiver_id: people.shop.accountId, amount: "5000000" }, FEE, 50);
const t2 = await view("get_transfer", { transfer_id: String(exit.value) });
const wd = await call(people.shop, id, "withdraw", { transfer_id: String(exit.value) }, 0n, 100);
await sleep(2500);
const shopUsdc = await provider.callFunction({ contractId: USDC, method: "ft_balance_of", args: { account_id: people.shop.accountId } });
step("send_usdc_contact", { send: exit, unlockEqualsCreated: t2?.unlock_at === t2?.created_at, withdraw: wd, shopUsdc });

// 9) a payment to a non-contact stays pending.
const other = await call(A, id, "transfer", { receiver_id: people.thief.accountId, amount: "5000000" }, FEE, 50);
step("pay_non_contact", { ...other, status: (await view("get_transfer", { transfer_id: String(other.value) }))?.status });

// 10) the "thief" (alice's key) adds himself as a contact; the recovery account panics.
step("thief_adds_contact", await call(A, id, "add_contact", { contact_id: people.thief.accountId }, FEE, 30));
const pan = await call(people.hp, id, "panic", { account_id: A.accountId }, 0n, 150);
step("panic", pan);
step("contacts_after_panic", await view("get_contacts", { account_id: A.accountId }));
step("locked_add_contact", await call(A, id, "add_contact", { contact_id: "someone.testnet" }, FEE, 30));

const ok =
  out.steps.pay_before_active.status === "Pending" &&
  out.steps.pay_active_contact.status === "Settled" &&
  BigInt(shopAfter.available) - BigInt(shopBefore.available) === 20000000n &&
  !out.steps.report_contact_payment.ok &&
  out.steps.send_usdc_contact.unlockEqualsCreated &&
  out.steps.send_usdc_contact.withdraw.ok &&
  out.steps.pay_non_contact.status === "Pending" &&
  pan.value?.contacts_cancelled === 1 &&
  out.steps.contacts_after_panic.length === 1 &&
  out.steps.contacts_after_panic[0].contact === people.shop.accountId &&
  !out.steps.locked_add_contact.ok;
out.allChecksPass = ok;
fs.mkdirSync(path.join(here, "out"), { recursive: true });
fs.writeFileSync(path.join(here, "out", "v2_dev_flow.json"), JSON.stringify(out, null, 2));
console.log("\nall checks pass:", ok);
