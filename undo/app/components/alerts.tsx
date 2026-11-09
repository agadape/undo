"use client";
// Rule-based alert for money leaving a protected account (PLAN §3, no AI): every pending outgoing transfer and
// every scheduled recovery change on an account whose recovery account is in this browser (or on the connected
// wallet) shows "Was this you?" until acknowledged. "No → PANIC" signs `panic` with the recovery account's key.
import { useEffect, useState } from "react";
import { useAccounts } from "@/components/accounts";
import { Button, Countdown, TxLink, usePoll } from "@/components/ui";
import { WindowBar } from "@/components/visual";
import { ACK_EVENT, ack, ackKey, contactAckKey, loadAcks, recoveryAckKey } from "@/lib/alerts";
import { UNDO } from "@/lib/config";
import { useAccountLabel, useFmt, useGasNote, useT } from "@/lib/i18n";
import { call, short, view } from "@/lib/near-client";
import { playTimeFx } from "@/lib/timefx";
import type { AccountView, Contact, Transfer } from "@/lib/types";

type Watched = { id: string; outgoing: Transfer[]; acct: AccountView; contacts: Contact[] };
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

  // Trusted contacts exist only on v2 contracts; on v1 skip the call entirely (it costs RPC quota).
  const [cfg] = usePoll(() => view<{ contact_delay_sec?: number }>(UNDO, "get_config"), [], 600_000);
  const hasContacts = cfg?.contact_delay_sec !== undefined;
  const [data, refresh] = usePoll<Watched[]>(
    () =>
      Promise.all(
        ids.map(async (id) => {
          const [outgoing, acct, contacts] = await Promise.all([
            view<Transfer[]>(UNDO, "get_outgoing", { account_id: id, limit: 20 }),
            view<AccountView>(UNDO, "get_account", { account_id: id }),
            hasContacts ? view<Contact[]>(UNDO, "get_contacts", { account_id: id }).catch(() => [] as Contact[]) : Promise.resolve([] as Contact[]),
          ]);
          return { id, outgoing, acct, contacts };
        }),
      ),
    [ids.join(","), hasContacts],
    12000,
  );

  const now = BigInt(Date.now()) * 1_000_000n;
  const isActive = (c: Contact) => c.active || BigInt(c.active_at) <= now;
  const cards = (data ?? []).flatMap((w) => {
    const items = w.outgoing.filter((x) => x.kind !== "Sweep" && x.status === "Pending" && BigInt(x.unlock_at) > now && !acks.has(ackKey(w.id, x.id)));
    const rec = w.acct.pending_recovery && !acks.has(recoveryAckKey(w.id, w.acct.pending_recovery)) ? w.acct.pending_recovery : null;
    // Unacknowledged contacts stay listed after they become active (e.g. one that matured while this browser was closed).
    const newContacts = w.contacts.filter((c) => !acks.has(contactAckKey(w.id, c.contact, c.active_at)));
    return items.length || rec || newContacts.length || results[w.id] ? [{ w, items, rec, newContacts }] : [];
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
      {cards.map(({ w, items, rec, newContacts }) => {
        const label = accountLabel(accounts.find((a) => a.id === w.id)?.label ?? "Wallet");
        const guard = accounts.find((a) => a.recoveryFor === w.id && a.kind !== "wallet" && a.id === w.acct.recovery);
        const otherKeys = [...items.map((x) => ackKey(w.id, x.id)), ...(rec ? [recoveryAckKey(w.id, rec)] : [])];
        const contactKey = (c: Contact) => contactAckKey(w.id, c.contact, c.active_at);
        const keys = [...otherKeys, ...newContacts.map(contactKey)];
        const done = results[w.id];
        const close = () => setResults(({ [w.id]: _, ...rest }) => rest);
        /** Remove every unrecognised contact still on chain (re-read now: one may have become active a moment ago)
         * and acknowledge only those that are really gone. Returns [removed, still there]. */
        async function dropUnrecognised(): Promise<[number, number, { hash?: string; gasless?: boolean } | undefined]> {
          const wanted = new Set(newContacts.map((c) => c.contact));
          let removed = 0;
          let last: { hash?: string; gasless?: boolean } | undefined;
          for (const c of (await view<Contact[]>(UNDO, "get_contacts", { account_id: w.id }).catch(() => newContacts)).filter((c) => wanted.has(c.contact))) {
            const r = await call(guard!, UNDO, "cancel_contact", { account_id: w.id, contact_id: c.contact }, { gasTera: "30" });
            if (r.ok) {
              removed += 1;
              last = r;
            }
          }
          const left = new Set((await view<Contact[]>(UNDO, "get_contacts", { account_id: w.id }).catch(() => newContacts)).map((c) => c.contact));
          ack(newContacts.filter((c) => !left.has(c.contact)).map(contactKey));
          return [removed, newContacts.filter((c) => left.has(c.contact)).length, last];
        }
        const leftText = (n: number) => (n ? t(` ${n} kontak belum bisa dihapus: hapus dari panel akun pemulihan.`, ` ${n} contact(s) could not be removed yet: remove them from the recovery account's panel.`) : "");
        async function removeContactsOnly() {
          const [removed, left, last] = await dropUnrecognised();
          setResults((p) => ({
            ...p,
            [w.id]: {
              ok: left === 0,
              text: t(`${removed} kontak yang tidak dikenal dihapus (tanpa Panik).`, `${removed} unrecognised contact(s) removed (no panic).`) + leftText(left) + (last ? gasNote(last) : ""),
              hash: last?.hash,
            },
          }));
          refresh();
        }
        async function panic() {
          const r = await call(guard!, UNDO, "panic", { account_id: w.id }, { gasTera: "150" });
          // Panic cancels contacts that are not active yet; any unrecognised contact still there needs cancel_contact.
          let cancelled = 0;
          let left = 0;
          if (r.ok) {
            playTimeFx("stop");
            ack(otherKeys);
            if (newContacts.length) [cancelled, left] = await dropUnrecognised();
          }
          setResults((p) => ({
            ...p,
            [w.id]: r.ok
              ? {
                  ok: true,
                  text: t(
                    "PANIK terkirim: transfer dibekukan, akun dikunci. Tanpa bantahan, finalisasi → uang ke akun pemulihan.",
                    "PANIC sent: transfers frozen, account locked. No contest → finalize → the money goes to the recovery account.",
                  ) +
                    (cancelled ? t(` ${cancelled} kontak aktif yang tidak dikenal juga dihapus.`, ` ${cancelled} unrecognised active contact(s) removed too.`) : "") +
                    leftText(left) +
                    gasNote(r),
                  hash: r.hash,
                }
              : { ok: false, text: r.error ?? t("gagal", "failed"), hash: r.hash },
          }));
          refresh();
        }
        if (!items.length && !rec && !newContacts.length && done) {
          return (
            <div key={w.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-[14px] px-5 py-3.5 text-sm ${done.ok ? "bg-ice/12" : "bg-rec/12"}`}>
              <span>
                {done.ok && (
                  <span aria-hidden className="timer mr-2 text-lg leading-none text-ice">
                    ❚❚ PAUSE
                  </span>
                )}
                {done.text} <TxLink hash={done.hash} />
              </span>
              <Button small variant="ghost" onClick={close}>
                {t("Tutup", "Close")}
              </Button>
            </div>
          );
        }
        return (
          <div key={w.id} className="space-y-3 rounded-[18px] bg-[#1a0a10] bg-[radial-gradient(120%_120%_at_0%_0%,#ff3b5f33,transparent_60%)] px-5 py-4 text-sm shadow-[0_24px_60px_-28px_#ff3b5f]">
            <div aria-hidden className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.12em] text-rec">
              <span>
                <span className="blink">●</span> {t("PERINGATAN", "ALERT")}
              </span>
              <span className="text-signal">▶ {t("JENDELA UNDO BERJALAN", "UNDO WINDOW RUNNING")}</span>
            </div>
            <p className="text-base font-bold sm:text-lg">
              🔔{" "}
              {items.length || rec
                ? t(`Ada uang keluar dari ${label} (${short(w.id)}). Ini kamu?`, `Money is leaving ${label} (${short(w.id)}). Was this you?`)
                : t(`Ada kontak tepercaya baru di ${label} (${short(w.id)}). Ini kamu?`, `A new trusted contact was added to ${label} (${short(w.id)}). Was this you?`)}
            </p>
            <ul className="space-y-0.5">
              {items.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold">{describe(x)}</span>
                  <span className="flex items-center gap-2 text-signal">
                    <WindowBar from={x.created_at} to={x.unlock_at} />
                    <span>
                      {t("final dalam", "final in")} <Countdown ns={x.unlock_at} />
                    </span>
                  </span>
                </li>
              ))}
              {newContacts.map((c) => (
                <li key={c.contact}>
                  {t(`Kontak tepercaya baru: ${short(c.contact)} (pembayaran ke sana langsung final)`, `New trusted contact: ${short(c.contact)} (payments to it are final at once)`)} ·{" "}
                  {isActive(c) ? (
                    <b>{t("SUDAH AKTIF", "ALREADY ACTIVE")}</b>
                  ) : (
                    <>
                      <Countdown ns={c.active_at} prefix={t("aktif dalam ", "active in ")} done={<b>{t("SUDAH AKTIF", "ALREADY ACTIVE")}</b>} />
                    </>
                  )}
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
              {guard && newContacts.length > 0 && (
                <Button small variant="ghost" onClick={removeContactsOnly} title={t("Akun pemulihan menghapus kontak ini tanpa mengunci akun", "The recovery account removes the contact without locking the account")}>
                  {t("Bukan — hapus kontak (tanpa Panik)", "No — remove the contact (no panic)")}
                </Button>
              )}
              {guard ? (
                <Button variant="danger" onClick={panic}>
                  🚨 {t("Bukan — PANIK", "No — PANIC")}
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
            <p className="text-xs text-dim">
              📱 {t("Di produk, peringatan ini dikirim ke HP akun pemulihan.", "In a real product, this alert goes to the recovery phone.")}
            </p>
          </div>
        );
      })}
    </div>
  );
}
