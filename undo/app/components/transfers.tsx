"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UNDO, USDC } from "@/lib/config";
import { call, fmt, short, view, type DemoAccount } from "@/lib/near-client";
import type { Config, Transfer } from "@/lib/types";
import { Button, Countdown, Notice, StatusBadge, TxLink } from "./ui";

const KIND: Record<string, string> = { Transfer: "rUSDC", Exit: "USDC", Sweep: "Sapu (Panik)" };
const nowNs = () => BigInt(Date.now()) * 1_000_000n;

type Mode = "self" | "recovery";

export function TransferRow({ t, me, cfg, mode, onDone }: { t: Transfer; me: DemoAccount; cfg: Config; mode: Mode; onDone: () => void }) {
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
    setMsg(r.ok ? { kind: "ok", text: `${label} berhasil`, hash: r.hash } : { kind: "error", text: r.error ?? "gagal", hash: r.hash });
    onDone();
    if (r.ok && then) then();
  }

  const report = () =>
    act("Laporan", () => call(me, UNDO, "report", { transfer_id: t.id, reason: "Pengirim melaporkan penipuan" }, { deposit: BigInt(cfg.bond), gasTera: "50" }), () => router.push(`/sidang/${t.id}`));
  const contest = () =>
    act("Bantahan", () => call(me, UNDO, "contest", { transfer_id: t.id, reason: t.kind === "Sweep" ? "Bukan saya yang menekan Panik" : "Pembayaran ini sah" }, { deposit: BigInt(cfg.bond), gasTera: "50" }), () => router.push(`/sidang/${t.id}`));
  const finalize = () => act("Finalisasi", () => call(me, UNDO, "finalize", { transfer_id: t.id }, { gasTera: "50" }));
  const release = () => act("Barang diterima", () => call(me, UNDO, "release", { transfer_id: t.id }, { gasTera: "50" }));
  const withdraw = () =>
    act("Pencairan USDC", async () => {
      const reg = await view(USDC, "storage_balance_of", { account_id: t.to }).catch(() => null);
      if (!reg) {
        const r = await call(me, USDC, "storage_deposit", { account_id: t.to, registration_only: true }, { deposit: 1_250_000_000_000_000_000_000n, gasTera: "30" });
        if (!r.ok) return r;
      }
      return call(me, UNDO, "withdraw", { transfer_id: t.id }, { gasTera: "100" });
    });

  const who = isSender ? `ke ${short(t.to)}` : `dari ${short(t.from)}`;
  return (
    <li className="flex flex-col gap-2 border-b border-stone-100 py-3 last:border-0 dark:border-stone-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="mono text-xs text-stone-500">#{t.id}</span>
          <span className="font-semibold tabular-nums">{fmt(t.amount)}</span>
          <span className="text-xs text-stone-500">{KIND[t.kind]}</span>
          <span className="text-sm">{ownUnwrap ? "unwrap ke diri sendiri" : who}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {/* The contract settles lazily: a matured transfer is final even while its stored status says Pending. */}
          <StatusBadge status={t.status === "Pending" && !inWindow && t.kind === "Transfer" ? "Settled" : t.status} />
          {exitReady && <span className="text-stone-500">siap dicairkan</span>}
          {inWindow && (
            <span>
              final dalam <Countdown ns={t.unlock_at} />
            </span>
          )}
          {frozenOpen && (
            <span>
              bantah dalam <Countdown ns={t.frozen_until} />
            </span>
          )}
          {t.final_to && <span className="text-stone-500">→ {short(t.final_to)}</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {mode === "self" && inWindow && isSender && !ownUnwrap && (
          <Button small variant="ghost" onClick={report} title="Bond 0,01 NEAR; kalau kalah, bond untuk penerima">
            Laporkan penipuan
          </Button>
        )}
        {mode === "recovery" && inWindow && (
          <>
            <Button small onClick={release} title="Hanya akun pemulihan yang bisa melepas lebih awal">
              Barang diterima
            </Button>
            <Button small variant="ghost" onClick={report}>
              Laporkan penipuan
            </Button>
          </>
        )}
        {canContest && mode === "self" && (
          <Button small variant="ghost" onClick={contest}>
            Bantah pembekuan
          </Button>
        )}
        {frozenDone && <Button small onClick={finalize}>Finalisasi (tanpa voting)</Button>}
        {exitReady && <Button small onClick={withdraw}>Cairkan USDC</Button>}
        {t.status === "Disputed" && (
          <Link className="rounded-lg border border-violet-300 px-2.5 py-1 text-xs font-medium text-violet-800 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-200 dark:hover:bg-violet-950" href={`/sidang/${t.id}`}>
            Buka sidang →
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
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      {!items ? (
        <p className="text-sm text-stone-500">memuat…</p>
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
