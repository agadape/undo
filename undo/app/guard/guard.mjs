// Penjaga (guard) for the "Coba Curi" challenge: one idempotent tick, safe to run from several places
// at once (local loop, Cloudflare cron, GitHub Actions). It holds:
// - a function-call key on the guard account limited to panic / finalize / unlock / release_expired
//   (no deposit, cannot move NEAR or rUSDC by itself);
// - optionally the demo account's (published) key, only to re-wrap fresh test USDC after a round.
import { Account, actions, teraToGas } from "near-api-js";

const ns = () => BigInt(Date.now()) * 1_000_000n;
const txUrl = (h) => `https://testnet.nearblocks.io/txns/${h}`;
const usd = (raw) => (Number(BigInt(raw)) / 1e6).toFixed(2);
const USDC = "usdc.fakes.testnet";

async function send(acct, receiverId, method, args, deposit = 0n, gas = 150) {
  const r = await acct.signAndSendTransaction({ receiverId, actions: [actions.functionCall(method, args, teraToGas(gas), deposit)] });
  if (r.status?.Failure) throw new Error(JSON.stringify(r.status.Failure).match(/panicked: ([^"\\]+)/)?.[1] ?? "failed");
  const v = r.status?.SuccessValue ? JSON.parse(Buffer.from(r.status.SuccessValue, "base64").toString() || "null") : null;
  return { hash: r.transaction.hash, value: v };
}

/**
 * @param {object} c
 * @param {import("near-api-js").Provider} c.provider
 * @param {string} c.contractId challenge contract
 * @param {string} c.demoId demo account (published key)
 * @param {string} c.guardId guard = demo's recovery account
 * @param {string} c.fcKey guard function-call key (panic/finalize/unlock/release_expired)
 * @param {string} [c.demoKey] demo key, for re-wrapping after a round
 * @param {string} [c.guardKey] guard full key, for minting test USDC to the demo account
 * @param {number} [c.targetUsd] balance to restore after a round (default 1000)
 * @param {(text: string) => Promise<void>} [c.notify]
 */
export async function tick(c) {
  const view = (method, args) => c.provider.callFunction({ contractId: c.contractId, method, args });
  const fc = new Account(c.guardId, c.provider, c.fcKey);
  const done = [];
  const notify = c.notify ?? (async () => {});
  const cfg = await view("get_config", {});
  const out = await view("get_outgoing", { account_id: c.demoId, limit: 100 });
  const acct = await view("get_account", { account_id: c.demoId });
  const now = ns();

  // 1) Anything leaving the demo account inside its window, or a scheduled recovery swap → panic.
  const attacks = out.filter((t) => t.kind !== "Sweep" && t.status === "Pending" && BigInt(t.unlock_at) > now);
  if (attacks.length || acct.pending_recovery) {
    const r = await send(fc, c.contractId, "panic", { account_id: c.demoId });
    const reacted = attacks.map((t) => Number((now - BigInt(t.created_at)) / 1_000_000_000n));
    done.push({ action: "panic", tx: r.hash, frozen: r.value?.frozen ?? [], swept: r.value?.swept, reactionSec: reacted, recoverySwap: !!acct.pending_recovery });
    await notify(`🚨 Coba Curi: ${attacks.length} transfer keluar dari akun umpan dibekukan${acct.pending_recovery ? " + penggantian akun pemulihan dibatalkan" : ""}. Reaksi ${Math.max(0, ...reacted)} dtk.\n${txUrl(r.hash)}`);
  }

  // 2) Frozen past the contest window → finalize (optimistic undo).
  for (const t of out.filter((t) => t.status === "Frozen" && t.frozen_until && BigInt(t.frozen_until) <= now)) {
    try {
      const r = await send(fc, c.contractId, "finalize", { transfer_id: t.id });
      done.push({ action: "finalize", id: t.id, tx: r.hash });
    } catch (e) {
      done.push({ action: "finalize", id: t.id, error: e.message });
    }
  }

  // 3) Disputes the council left alone past the timeout → apply silence (a contested panic stands).
  const timeoutNs = BigInt(cfg.dispute_timeout_sec) * 1_000_000_000n;
  for (const t of out.filter((t) => t.status === "Disputed" && t.dispute && BigInt(t.dispute.opened_at) + timeoutNs <= now)) {
    try {
      const r = await send(fc, c.contractId, "release_expired", { transfer_id: t.id });
      done.push({ action: "release_expired", id: t.id, tx: r.hash });
    } catch (e) {
      done.push({ action: "release_expired", id: t.id, error: e.message });
    }
  }

  // 4) Round over (nothing open) → unlock and restore the bait.
  const fresh = await view("get_outgoing", { account_id: c.demoId, limit: 100 });
  const stillOpen = fresh.some((t) => t.status === "Frozen" || t.status === "Disputed" || (t.status === "Pending" && t.kind !== "Exit" && BigInt(t.unlock_at) > ns()));
  const st = await view("get_account", { account_id: c.demoId });
  if (st.locked && !stillOpen) {
    const r = await send(fc, c.contractId, "unlock", { account_id: c.demoId });
    done.push({ action: "unlock", tx: r.hash });
  }
  const bal = await view("balance_of", { account_id: c.demoId });
  const target = BigInt(Math.round((c.targetUsd ?? 1000) * 1e6));
  const have = BigInt(bal.available) + BigInt(bal.pending_in);
  if (!bal.locked && !stillOpen && have < target && c.demoKey && c.guardKey) {
    const top = target - have;
    try {
      const guard = new Account(c.guardId, c.provider, c.guardKey);
      const demo = new Account(c.demoId, c.provider, c.demoKey);
      await send(guard, USDC, "mint", { account_id: c.demoId, amount: top.toString() }, 0n, 30);
      const r = await send(demo, USDC, "ft_transfer_call", { receiver_id: c.contractId, amount: top.toString(), msg: "" }, 1n, 100);
      done.push({ action: "refill", amount: top.toString(), tx: r.hash });
    } catch (e) {
      // e.g. an attacker rotated or deleted the published key: the account must be recreated by the guard.
      done.push({ action: "refill", error: e.message });
    }
  }
  // One message for the rest of the round (errors are reported, de-duplicated, by the Cloudflare Worker).
  const lines = done
    .filter((d) => d.action !== "panic" && !d.error)
    .map((d) =>
      d.action === "finalize"
        ? `✅ #${d.id} difinalisasi: uangnya kembali ke penjaga ${txUrl(d.tx)}`
        : d.action === "release_expired"
          ? `⏱ #${d.id}: diamnya dewan diterapkan ${txUrl(d.tx)}`
          : d.action === "unlock"
            ? `🔓 Akun umpan dibuka lagi ${txUrl(d.tx)}`
            : d.action === "refill"
              ? `💧 Umpan diisi ulang ${usd(d.amount)} rUSDC ${txUrl(d.tx)}`
              : `${d.action} ${txUrl(d.tx)}`,
    );
  if (lines.length) await notify(["Coba Curi", ...lines].join("\n"));
  return { at: new Date().toISOString(), done };
}

/** Telegram notifier when TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID are set; otherwise a no-op. */
export function telegram(token, chatId) {
  if (!token || !chatId) return async () => {};
  return async (text) => {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    }).catch(() => {});
  };
}
