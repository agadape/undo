"use client";
// Rule-based alert for money leaving a protected account (PLAN §3, no AI): every pending outgoing transfer and
// every scheduled recovery change on an account whose recovery account is in this browser (or on the connected
// wallet) shows "Was this you?" until acknowledged. "No → PANIC" signs `panic` with the recovery account's key.
import { useEffect, useState } from "react";
import { useAccounts } from "@/components/accounts";
import { Button, Countdown, TxLink, usePoll } from "@/components/ui";
import { ACK_EVENT, ack, ackKey, loadAcks, recoveryAckKey } from "@/lib/alerts";
import { UNDO } from "@/lib/config";
import { useAccountLabel, useFmt, useGasNote, useT } from "@/lib/i18n";
import { call, short, view } from "@/lib/near-client";
import type { AccountView, Transfer } from "@/lib/types";

type Watched = { id: string; outgoing: Transfer[]; acct: AccountView };
type Result = { ok: boolean; text: string; hash?: string };

export function OutgoingAlerts() {
  const { accounts, wallet } = useAccounts();
  const t = useT();
  const fmt = useFmt();
  const accountLabel = useAccountLabel();
  const gasNote = useGasNote();
  const ids = [...new Set([...(wallet ? [wallet.id] : []), ...accounts.flatMap((a) => (a.recoveryFor ? [a.recoveryFor] : []))])].sort();
  const [acks, setAcks] = useState<Set<string>>(() => new Set());
  const [results, setResults] = useState<Record<string, Result>>({});

  useEffect(() => {
    const sync = () => setAcks(loadAcks());
    sync();
    window.addEventListener(ACK_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ACK_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const [data, refresh] = usePoll<Watched[]>(
    () =>
      Promise.all(
        ids.map(async (id) => {
          const [outgoing, acct] = await Promise.all([view<Transfer[]>(UNDO, "get_outgoing", { account_id: id, limit: 20 }), view<AccountView>(UNDO, "get_account", { account_id: id })]);
          return { id, outgoing, acct };
        }),
      ),
    [ids.join(",")],
    12000,
  );

  const now = BigInt(Date.now()) * 1_000_000n;
  const cards = (data ?? []).flatMap((w) => {
    const items = w.outgoing.filter((x) => x.kind !== "Sweep" && x.status === "Pending" && BigInt(x.unlock_at) > now && !acks.has(ackKey(w.id, x.id)));
    const rec = w.acct.pending_recovery && !acks.has(recoveryAckKey(w.id, w.acct.pending_recovery)) ? w.acct.pending_recovery : null;
    return items.length || rec || results[w.id] ? [{ w, items, rec }] : [];
  });
  if (!cards.length) return null;

  const describe = (x: Transfer) =>
    x.kind === "Exit"
      ? x.to === x.from
        ? t(`unwrap ${fmt(x.amount)} rUSDC ke USDC`, `unwrap ${fmt(x.amount)} rUSDC to USDC`)
        : t(`${fmt(x.amount)} USDC ke ${short(x.to)}`, `${fmt(x.amount)} USDC to ${short(x.to)}`)
      : t(`${fmt(x.amount)} rUSDC ke ${short(x.to)}`, `${fmt(x.amount)} rUSDC to ${short(x.to)}`);

  return (
    <div className="mb-4 space-y-2" role="alert">
      {cards.map(({ w, items, rec }) => {
        const label = accountLabel(accounts.find((a) => a.id === w.id)?.label ?? "Wallet");
        const guard = accounts.find((a) => a.recoveryFor === w.id && a.kind !== "wallet" && a.id === w.acct.recovery);
        const keys = [...items.map((x) => ackKey(w.id, x.id)), ...(rec ? [recoveryAckKey(w.id, rec)] : [])];
        const done = results[w.id];
        const close = () => setResults(({ [w.id]: _, ...rest }) => rest);
        async function panic() {
          const r = await call(guard!, UNDO, "panic", { account_id: w.id }, { gasTera: "150" });
          if (r.ok) ack(keys);
          setResults((p) => ({
            ...p,
            [w.id]: r.ok
              ? {
                  ok: true,
                  text: t(
                    "PANIK terkirim: transfer keluar dibekukan dan akun dikunci. Setelah jendela bantah lewat tanpa bantahan, siapa pun bisa finalize dan uangnya masuk ke akun pemulihan.",
                    "PANIC sent: outgoing transfers are frozen and the account is locked. Once the contest window passes with no contest, anyone can finalize and the money goes to the recovery account.",
                  ) + gasNote(r),
                  hash: r.hash,
                }
              : { ok: false, text: r.error ?? t("gagal", "failed"), hash: r.hash },
          }));
          refresh();
        }
        if (!items.length && !rec && done) {
          return (
            <div key={w.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm ${done.ok ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"}`}>
              <span>
                {done.text} <TxLink hash={done.hash} />
              </span>
              <Button small variant="ghost" onClick={close}>
                {t("Tutup", "Close")}
              </Button>
            </div>
          );
        }
        return (
          <div key={w.id} className="space-y-2 rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3 text-sm text-red-950 dark:border-red-800 dark:bg-red-950 dark:text-red-50">
            <p className="font-semibold">
              🔔 {t(`Ada uang keluar dari ${label} (${short(w.id)}). Ini kamu?`, `Money is leaving ${label} (${short(w.id)}). Was this you?`)}
            </p>
            <ul className="space-y-0.5">
              {items.map((x) => (
                <li key={x.id}>
                  {describe(x)} · {t("final dalam", "final in")} <Countdown ns={x.unlock_at} />
                </li>
              ))}
              {rec && (
                <li>
                  {t(`Akun pemulihan dijadwalkan diganti ke ${short(rec[0])}`, `The recovery account is scheduled to change to ${short(rec[0])}`)} · {t("berlaku dalam", "takes effect in")} <Countdown ns={rec[1]} />
                </li>
              )}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <Button small variant="ghost" onClick={() => ack(keys)}>
                {t("Ya, ini aku", "Yes, it was me")}
              </Button>
              {guard ? (
                <Button small variant="danger" onClick={panic}>
                  {t("Bukan — PANIK", "No — PANIC")}
                </Button>
              ) : w.acct.recovery ? (
                <span className="text-xs">{t(`Bukan? Tekan Panik dari akun pemulihan ${short(w.acct.recovery)}.`, `Not you? Press Panic from the recovery account ${short(w.acct.recovery)}.`)}</span>
              ) : (
                <span className="text-xs">{t("Akun ini belum punya akun pemulihan, jadi Panik tidak tersedia.", "This account has no recovery account, so Panic is not available.")}</span>
              )}
              {done && !done.ok && (
                <span className="text-xs">
                  {done.text} <TxLink hash={done.hash} />
                </span>
              )}
            </div>
            <p className="text-xs opacity-75">
              {t(
                "Notifikasi ini muncul di browser yang memegang akun pemulihan. Di produk, pesan yang sama dikirim ke HP akun pemulihan.",
                "This alert shows in the browser that holds the recovery account. In a product, the same message goes to the recovery account's phone.",
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}
