"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Notice, Pill, StatusBadge, TxLink, usePoll } from "@/components/ui";
import { ADDR, DAO, UNDO } from "@/lib/config";
import { fmt, short, view } from "@/lib/near-client";
import type { Config, Transfer } from "@/lib/types";

async function loadDisputes(): Promise<Transfer[]> {
  const cfg = await view<Config>(UNDO, "get_config");
  const last = Number(cfg.next_id) - 1;
  const ids = Array.from({ length: Math.min(60, last + 1) }, (_, i) => last - i);
  const all = await Promise.all(ids.map((id) => view<Transfer | null>(UNDO, "get_transfer", { transfer_id: String(id) }).catch(() => null)));
  return all.filter((t): t is Transfer => !!t?.dispute);
}

const PASS_KEY = "undo.council.passcode";

function PasscodeField() {
  const [value, setValue] = useState("");
  useEffect(() => {
    try {
      setValue(localStorage.getItem(PASS_KEY) ?? "");
    } catch {
      /* ignore */
    }
  }, []);
  return (
    <label className="mt-3 block text-xs text-stone-500">
      Passcode dewan (hanya untuk anggota dewan; disimpan di browser ini)
      <input
        type="password"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          try {
            localStorage.setItem(PASS_KEY, e.target.value);
          } catch {
            /* ignore */
          }
        }}
        className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm sm:w-64 dark:border-stone-700 dark:bg-stone-950"
      />
    </label>
  );
}

export default function DewanPage() {
  const [items, refresh] = usePoll(loadDisputes, [], 5000);
  const open = items?.filter((t) => t.status === "Disputed") ?? [];
  const closed = items?.filter((t) => t.status !== "Disputed") ?? [];
  return (
    <div className="space-y-4">
      <Card title="Dewan">
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Dewan adalah{" "}
          <a className="underline" href={ADDR(DAO)} target="_blank" rel="noreferrer">
            Sputnik DAO
          </a>
          . Setiap putusan = proposal + vote, terekam publik. Dewan hanya bisa memilih A atau B (uang kembali ke pihak pengirim, atau diteruskan ke penerima) dan hanya atas uang yang masih dalam sengketa. Selama hackathon anggotanya tim kami; tombol di bawah membuat proposal dan vote atas nama anggota itu.
        </p>
        <PasscodeField />
      </Card>
      {!items ? (
        <p className="text-sm text-stone-500">memuat sengketa…</p>
      ) : open.length === 0 ? (
        <Notice kind="info">Tidak ada sengketa yang menunggu.</Notice>
      ) : (
        open.map((t) => <DisputeCard key={t.id} t={t} onDone={refresh} />)
      )}
      {closed.length > 0 && (
        <Card title="Sudah diputus">
          <ul className="space-y-1 text-sm">
            {closed.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <Link className="mono text-xs underline" href={`/sidang/${t.id}`}>
                  #{t.id}
                </Link>
                <StatusBadge status={t.status} />
                <span>{fmt(t.amount)}</span>
                <span className="text-stone-500">
                  oleh {t.dispute?.decided_by} → {t.final_to ? short(t.final_to) : "—"}
                </span>
                {t.dispute?.council_reason && <span className="text-stone-500">“{t.dispute.council_reason}”</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function DisputeCard({ t, onDone }: { t: Transfer; onDone: () => void }) {
  const d = t.dispute!;
  const rec = d.recommendation;
  const [reason, setReason] = useState(rec ? `Mengikuti rekomendasi TEE: ${rec.alasan_publik}`.slice(0, 280) : "");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string; hash?: string }>();
  const sweep = t.kind === "Sweep";

  async function decide(reverse: boolean) {
    let passcode = "";
    try {
      passcode = localStorage.getItem(PASS_KEY) ?? "";
    } catch {
      /* ignore */
    }
    const res = await fetch("/api/council/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transferId: t.id, reverse, reason, passcode }) });
    const body = await res.json();
    setMsg(res.ok ? { kind: "ok", text: "Proposal dibuat dan disetujui; kontrak mengeksekusi putusan.", hash: body.voteTx } : { kind: "error", text: body.error ?? "gagal" });
    onDone();
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2 normal-case">
          <Link href={`/sidang/${t.id}`} className="underline">
            Sengketa #{t.id}
          </Link>
          <span className="text-stone-500">{d.origin === "Report" ? "laporan penipuan" : "bantahan Panik"}</span>
        </span>
      }
      right={<span className="font-semibold tabular-nums">{fmt(t.amount)}</span>}
    >
      <p className="text-sm text-stone-500">
        {short(t.from)} → {short(t.to)} · dibuka oleh {short(d.opened_by)}: “{d.reason}”
      </p>
      <div className="my-3 rounded-lg bg-stone-50 p-3 text-sm dark:bg-stone-950">
        {rec ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <b>Rekomendasi TEE: {rec.rekomendasi}</b>
              <Pill>confidence {rec.confidence}</Pill>
              {rec.curiga_injeksi && <Pill tone="danger">injeksi terdeteksi</Pill>}
            </div>
            <p className="mt-1">“{rec.alasan_publik}”</p>
          </>
        ) : (
          <span className="text-stone-500">Belum ada rekomendasi AI. Dewan tetap bisa memutus.</span>
        )}
      </div>
      <label className="block text-xs text-stone-500">
        Alasan publik putusan
        <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-950" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => decide(true)}>{sweep ? "Kembalikan ke pemilik akun" : "Kembalikan ke pihak pengirim"}</Button>
        <Button variant="ghost" onClick={() => decide(false)}>
          {sweep ? "Teruskan ke akun pemulihan" : "Teruskan ke penerima"}
        </Button>
      </div>
      {msg && (
        <div className="mt-3">
          <Notice kind={msg.kind}>
            {msg.text} <TxLink hash={msg.hash} />
          </Notice>
        </div>
      )}
    </Card>
  );
}
