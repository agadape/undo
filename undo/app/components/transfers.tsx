"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UNDO, USDC } from "@/lib/config";
import { useFmt, useLang, useT } from "@/lib/i18n";
import { call, short, view, type DemoAccount } from "@/lib/near-client";
import type { Config, Transfer } from "@/lib/types";
import { Button, Countdown, Notice, StatusBadge, TxLink } from "./ui";

const KIND: Record<string, string> = { Transfer: "rUSDC", Exit: "USDC", Sweep: "Sapu (Panik)" };
const KIND_EN: Record<string, string> = { Transfer: "rUSDC", Exit: "USDC", Sweep: "Sweep (Panic)" };
const nowNs = () => BigInt(Date.now()) * 1_000_000n;

type Mode = "self" | "recovery";

export function TransferRow({ t, me, cfg, mode, onDone }: { t: Transfer; me: DemoAccount; cfg: Config; mode: Mode; onDone: () => void }) {
  // `t` is the transfer here, so the translator is `tr`.
  const tr = useT();
  const lang = useLang();
  const fmt = useFmt();
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string; hash?: string }>();
  const now = nowNs();
  const inWindow = t.status === "Pending" && now < BigInt(t.unlock_at);
  const ownUnwrap = t.kind === "Exit" && t.to === t.from;
  const frozenOpen = t.status === "Frozen" && t.frozen_until && now < BigInt(t.frozen_until);
  const frozenDone = t.status === "Frozen" && t.frozen_until && now >= BigInt(t.frozen_until);
  const exitReady = t.kind === "Exit" && t.status === "Pending" && now >= BigInt(t.unlock_at);
  const isSender = t.from === me.id;
  const isReceiver = t.to === me.id;
  const canContest = frozenOpen && (t.kind === "Sweep" ? isSender : isSender || isReceiver);

  async function act(label: string, fn: () => Promise<{ ok: boolean; hash?: string; error?: string }>, then?: () => void) {
    const r = await fn();
    setMsg(r.ok ? { kind: "ok", text: tr(`${label} berhasil`, `${label}: done`), hash: r.hash } : { kind: "error", text: r.error ?? tr("gagal", "failed"), hash: r.hash });
    onDone();
    if (r.ok && then) then();
  }

  // `reason` is free text stored on-chain and shown to the council, so it is written in the user's language.
  const report = () =>
    act(tr("Laporan", "Report"), () => call(me, UNDO, "report", { transfer_id: t.id, reason: tr("Pengirim melaporkan penipuan", "The sender reports fraud") }, { deposit: BigInt(cfg.bond), gasTera: "50" }), () => router.push(`/sidang/${t.id}`));
  const contest = () =>
    act(tr("Bantahan", "Contest"), () => call(me, UNDO, "contest", { transfer_id: t.id, reason: t.kind === "Sweep" ? tr("Bukan saya yang menekan Panik", "I did not press panic") : tr("Pembayaran ini sah", "This payment is legitimate") }, { deposit: BigInt(cfg.bond), gasTera: "50" }), () => router.push(`/sidang/${t.id}`));
  const finalize = () => act(tr("Finalisasi", "Finalize"), () => call(me, UNDO, "finalize", { transfer_id: t.id }, { gasTera: "50" }));
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

  const who = isSender ? tr(`ke ${short(t.to)}`, `to ${short(t.to)}`) : tr(`dari ${short(t.from)}`, `from ${short(t.from)}`);
  return (
    <li className="flex flex-col gap-2 border-b border-stone-100 py-3 last:border-0 dark:border-stone-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="mono text-xs text-stone-500">#{t.id}</span>
          <span className="font-semibold tabular-nums">{fmt(t.amount)}</span>
          <span className="text-xs text-stone-500">{(lang === "en" ? KIND_EN : KIND)[t.kind]}</span>
          <span className="text-sm">{ownUnwrap ? tr("unwrap ke diri sendiri", "unwrap to self") : who}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {/* The contract settles lazily: a matured transfer is final even while its stored status says Pending. */}
          <StatusBadge status={t.status === "Pending" && !inWindow && t.kind === "Transfer" ? "Settled" : t.status} />
          {exitReady && <span className="text-stone-500">{tr("siap dicairkan", "ready to withdraw")}</span>}
          {inWindow && (
            <span>
              {tr("final dalam", "final in")} <Countdown ns={t.unlock_at} />
            </span>
          )}
          {frozenOpen && (
            <span>
              {tr("bantah dalam", "contest within")} <Countdown ns={t.frozen_until} />
            </span>
          )}
          {t.final_to && <span className="text-stone-500">→ {short(t.final_to)}</span>}
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
          <Link className="rounded-lg border border-violet-300 px-2.5 py-1 text-xs font-medium text-violet-800 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-200 dark:hover:bg-violet-950" href={`/sidang/${t.id}`}>
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

export function TransferList({ title, items, me, cfg, mode, onDone, empty }: { title: string; items: Transfer[] | undefined; me: DemoAccount; cfg: Config; mode: Mode; onDone: () => void; empty: string }) {
  const tr = useT();
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      {!items ? (
        <p className="text-sm text-stone-500">{tr("memuat…", "loading…")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-stone-500">{empty}</p>
      ) : (
        <ul>
          {items.map((t) => (
            <TransferRow key={t.id} t={t} me={me} cfg={cfg} mode={mode} onDone={onDone} />
          ))}
        </ul>
      )}
    </div>
  );
}
