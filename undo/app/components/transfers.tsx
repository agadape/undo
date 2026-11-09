"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UNDO, USDC } from "@/lib/config";
import { useAccountLabel, useFmt, useGasNote, useLang, useT } from "@/lib/i18n";
import { call, short, view, type DemoAccount } from "@/lib/near-client";
import { playTimeFx } from "@/lib/timefx";
import type { Config, Transfer } from "@/lib/types";
import { Button, Countdown, Notice, StatusBadge, TxLink, btnClass } from "./ui";
import { useAccounts } from "./accounts";
import { WindowBar } from "./visual";

const KIND: Record<string, string> = { Transfer: "rUSDC", Exit: "USDC", Sweep: "Sapu (Panik)" };
const KIND_EN: Record<string, string> = { Transfer: "rUSDC", Exit: "USDC", Sweep: "Sweep (Panic)" };
const nowNs = () => BigInt(Date.now()) * 1_000_000n;

type Mode = "self" | "recovery";

type Msg = { kind: "ok" | "error"; text: string; hash?: string };

/** `onMessage`: show results in the parent instead (for lists whose rows disappear once acted on). */
export function TransferRow({ t, me, cfg, mode, onDone, onMessage }: { t: Transfer; me: DemoAccount; cfg: Config; mode: Mode; onDone: () => void; onMessage?: (m: Msg) => void }) {
  // `t` is the transfer here, so the translator is `tr`.
  const tr = useT();
  const lang = useLang();
  const fmt = useFmt();
  const gasNote = useGasNote();
  const router = useRouter();
  const { accounts } = useAccounts();
  const accountLabel = useAccountLabel();
  const [ownMsg, setOwnMsg] = useState<Msg>();
  const msg = onMessage ? undefined : ownMsg;
  const setMsg = (m: Msg) => (onMessage ? onMessage(m) : setOwnMsg(m));
  const now = nowNs();
  const inWindow = t.status === "Pending" && now < BigInt(t.unlock_at);
  const ownUnwrap = t.kind === "Exit" && t.to === t.from;
  const frozenOpen = t.status === "Frozen" && t.frozen_until && now < BigInt(t.frozen_until);
  // Finalize 3 s after frozen_until, so the relayer's own 2 s margin has passed too.
  const frozenDone = t.status === "Frozen" && t.frozen_until && now >= BigInt(t.frozen_until) + 3_000_000_000n;
  const exitReady = t.kind === "Exit" && t.status === "Pending" && now >= BigInt(t.unlock_at);
  const isSender = t.from === me.id;
  const isReceiver = t.to === me.id;
  const canContest = frozenOpen && (t.kind === "Sweep" ? isSender : isSender || isReceiver);

  async function act(label: string, fn: () => Promise<{ ok: boolean; hash?: string; error?: string; gasless?: boolean }>, then?: () => void) {
    const r = await fn();
    setMsg(r.ok ? { kind: "ok", text: tr(`${label} berhasil`, `${label}: done`) + gasNote(r), hash: r.hash } : { kind: "error", text: r.error ?? tr("gagal", "failed"), hash: r.hash });
    onDone();
    if (r.ok && then) then();
  }

  // `reason` is free text stored on-chain and shown to the council, so it is written in the user's language.
  const report = () =>
    act(tr("Laporan", "Report"), () => call(me, UNDO, "report", { transfer_id: t.id, reason: tr("Pengirim melaporkan penipuan", "The sender reports fraud") }, { deposit: BigInt(cfg.bond), gasTera: "50" }), () => router.push(`/sidang/${t.id}`));
  const contest = () =>
    act(tr("Bantahan", "Contest"), () => call(me, UNDO, "contest", { transfer_id: t.id, reason: t.kind === "Sweep" ? tr("Bukan saya yang menekan Panik", "I did not press panic") : tr("Pembayaran ini sah", "This payment is legitimate") }, { deposit: BigInt(cfg.bond), gasTera: "50" }), () => router.push(`/sidang/${t.id}`));
  const finalize = () => act(tr("Finalisasi", "Finalize"), () => call(me, UNDO, "finalize", { transfer_id: t.id }, { gasTera: "50" }), () => playTimeFx("rewind"));
  const release = () => act(tr("Barang diterima", "Goods received"), () => call(me, UNDO, "release", { transfer_id: t.id }, { gasTera: "50" }));
  const withdraw = () =>
    act(tr("Pencairan USDC", "USDC withdrawal"), async () => {
      const reg = await view(USDC, "storage_balance_of", { account_id: t.to }).catch(() => null);
      if (!reg) {
        const r = await call(me, USDC, "storage_deposit", { account_id: t.to, registration_only: true }, { deposit: 1_250_000_000_000_000_000_000n, gasTera: "30" });
        if (!r.ok) return r;
      }
      return call(me, UNDO, "withdraw", { transfer_id: t.id }, { gasTera: "100" });
    });

  // Name the other side when it is one of this browser's demo accounts ("to Thief" reads faster than an account id).
  const nameOf = (id: string) => {
    const label = accounts.find((a) => a.id === id)?.label;
    return label ? accountLabel(label) : short(id);
  };
  const other = isSender ? t.to : t.from;
  const otherName = accounts.find((a) => a.id === other)?.label;
  const otherText = nameOf(other);
  const who = isSender ? tr(`ke ${otherText}`, `to ${otherText}`) : tr(`dari ${otherText}`, `from ${otherText}`);
  const thief = otherName === "Pencuri";
  return (
    <li className={`flex flex-col gap-2 rounded-[12px] px-3 py-3 ${t.status === "Frozen" ? "bg-ice/8" : "odd:bg-ink/[0.025]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Direction at a glance: out = up-right, in = down-left. */}
          <span
            aria-hidden
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${thief ? "bg-rec/15 text-rec" : isSender && !ownUnwrap ? "bg-signal/12 text-signal" : "bg-sky/12 text-sky"}`}
          >
            {ownUnwrap ? "⇄" : isSender ? "↗" : "↙"}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="flex items-baseline gap-1.5">
              <span className="serif text-xl leading-none tabular-nums text-ink">{fmt(t.amount)}</span>
              <span className="text-xs text-muted">{(lang === "en" ? KIND_EN : KIND)[t.kind]}</span>
            </span>
            <span className={`text-sm leading-5 ${thief ? "font-semibold text-rec" : "text-dim"}`}>
              {ownUnwrap ? tr("unwrap ke diri sendiri", "unwrap to self") : who} <span className="mono text-xs text-muted">· #{t.id}</span>
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {/* The contract settles lazily: a matured transfer is final even while its stored status says Pending. */}
          <StatusBadge status={t.status === "Pending" && !inWindow && t.kind === "Transfer" ? "Settled" : t.status} />
          {exitReady && <span className="text-muted">{tr("siap dicairkan", "ready to withdraw")}</span>}
          {inWindow && (
            <span className="flex items-center gap-2 text-signal">
              <WindowBar from={t.created_at} to={t.unlock_at} />
              <span>
                {tr("final dalam", "final in")} <Countdown ns={t.unlock_at} />
              </span>
            </span>
          )}
          {frozenOpen && (
            <span className="flex items-center gap-2 text-ice">
              <WindowBar from={(BigInt(t.frozen_until!) - BigInt(cfg.contest_window_sec) * 1_000_000_000n).toString()} to={t.frozen_until!} tone="ice" />
              <span>
                {tr("bantah dalam", "contest within")} <Countdown ns={t.frozen_until} />
              </span>
            </span>
          )}
          {t.kind === "Transfer" && t.status === "Settled" && t.unlock_at === t.created_at && t.dispute === null && (
            <span className="text-muted">{tr("langsung final (kontak)", "final at once (contact)")}</span>
          )}
          {t.kind === "Exit" && t.to !== t.from && t.unlock_at === t.created_at && <span className="text-muted">{tr("tanpa jendela (kontak)", "no window (contact)")}</span>}
          {t.final_to && <span className="text-muted">→ {nameOf(t.final_to)}</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {mode === "self" && inWindow && isSender && !ownUnwrap && (
          <Button small variant="ghost" onClick={report} title={tr("Bond 0,01 NEAR; kalau kalah, bond untuk penerima", "Bond 0.01 NEAR; if you lose, the bond goes to the receiver")}>
            {tr("Laporkan penipuan", "Report fraud")}
          </Button>
        )}
        {mode === "recovery" && inWindow && (
          <>
            <Button small onClick={release} title={tr("Hanya akun pemulihan yang bisa melepas lebih awal", "Only the recovery account can release early")}>
              {tr("Barang diterima", "Goods received")}
            </Button>
            <Button small variant="ghost" onClick={report}>
              {tr("Laporkan penipuan", "Report fraud")}
            </Button>
          </>
        )}
        {canContest && mode === "self" && (
          <Button small variant="ghost" onClick={contest}>
            {tr("Bantah pembekuan", "Contest the freeze")}
          </Button>
        )}
        {frozenDone && <Button small onClick={finalize}>{tr("Finalisasi (tanpa voting)", "Finalize (no vote)")}</Button>}
        {exitReady && <Button small onClick={withdraw}>{tr("Cairkan USDC", "Withdraw USDC")}</Button>}
        {t.status === "Disputed" && (
          <Link className={btnClass("ghost", true)} href={`/sidang/${t.id}`}>
            {tr("Buka sidang →", "Open court case →")}
          </Link>
        )}
      </div>
      {msg && (
        <Notice kind={msg.kind}>
          {msg.text} <TxLink hash={msg.hash} />
        </Notice>
      )}
    </li>
  );
}

export function TransferList({
  title,
  items,
  me,
  cfg,
  mode,
  onDone,
  empty,
  onMessage,
}: {
  title: string;
  items: Transfer[] | undefined;
  me: DemoAccount;
  cfg: Config;
  mode: Mode;
  onDone: () => void;
  empty: string;
  onMessage?: (m: Msg) => void;
}) {
  const tr = useT();
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.1em] text-dim">{title}</h3>
      {!items ? (
        <p className="text-sm text-muted">{tr("memuat…", "loading…")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul>
          {items.map((t) => (
            <TransferRow key={t.id} t={t} me={me} cfg={cfg} mode={mode} onDone={onDone} onMessage={onMessage} />
          ))}
        </ul>
      )}
    </div>
  );
}
