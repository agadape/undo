"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAccounts } from "@/components/accounts";
import { Button, Card, Countdown, Notice, Pill, StatusBadge, TxLink, usePoll } from "@/components/ui";
import { UNDO } from "@/lib/config";
import { encryptTo, sha256hex, type Side } from "@/lib/court";
import { call, fmt, short, view } from "@/lib/near-client";
import type { AccountView, Config, Transfer } from "@/lib/types";

type CourtStatus = { stored: Record<Side, boolean>; run: { status: string; tx?: string; costUsd?: number; error?: string; requestBytes?: number } | null };
const pendingKey = (id: string, side: Side) => `undo.evidence.${id}.${side}`;

export default function SidangPage() {
  const { id } = useParams<{ id: string }>();
  const { active } = useAccounts();
  const [cfg] = usePoll(() => view<Config>(UNDO, "get_config"), [], 15000);
  const [t, refreshT] = usePoll(() => view<Transfer | null>(UNDO, "get_transfer", { transfer_id: id }), [id], 5000);
  const [senderAcct] = usePoll(() => (t ? view<AccountView>(UNDO, "get_account", { account_id: t.from }) : Promise.resolve(undefined)), [t?.from], 20000);
  const [court, refreshCourt] = usePoll(() => fetch(`/api/court/evidence?id=${id}`).then((r) => r.json() as Promise<CourtStatus>), [id], 6000);
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "info"; text: string; hash?: string }>();
  const [text, setText] = useState("");

  if (!t || !cfg) return <p className="text-sm text-stone-500">memuat sidang #{id}…</p>;
  const d = t.dispute;
  if (!d) return <Notice kind="info">Transfer #{id} tidak (pernah) disengketakan.</Notice>;

  const recovery = senderAcct?.recovery ?? null;
  const ownUnwrap = t.kind === "Exit" && t.to === t.from;
  const senderSide = t.kind === "Sweep" ? [t.from] : [...(ownUnwrap ? [] : [t.from]), ...(recovery ? [recovery] : [])];
  const mySide: Side | null = !active ? null : senderSide.includes(active.id) && active.id !== t.to ? "pengirim" : active.id === t.to ? "penerima" : null;
  const slotFilled = mySide === "pengirim" ? !!d.evidence_sender : mySide === "penerima" ? !!d.evidence_receiver : true;
  const now = BigInt(Date.now()) * 1_000_000n;
  const evidenceOpen = now < BigInt(d.evidence_deadline);
  const timeoutAt = (BigInt(d.opened_at) + BigInt(cfg.dispute_timeout_sec) * 1_000_000_000n).toString();
  const timedOut = now >= BigInt(timeoutAt);
  const committedSides = (["pengirim", "penerima"] as Side[]).filter((s) => (s === "pengirim" ? d.evidence_sender : d.evidence_receiver));
  const allUploaded = committedSides.every((s) => court?.stored?.[s]);
  const readyToJudge = (!!d.evidence_sender && !!d.evidence_receiver) || !evidenceOpen;
  const decided = t.status === "Settled" || t.status === "Reversed" || (t.kind === "Exit" && t.status === "Pending" && !!d.decided_by);

  async function submitEvidence() {
    if (!active || !mySide || !cfg?.court.signer) return;
    if (text.trim().length < 5) return setMsg({ kind: "error", text: "tulis bukti dulu" });
    const env = encryptTo(cfg.court.signer, text.trim());
    const hash = sha256hex(env.envelope);
    try {
      localStorage.setItem(pendingKey(id, mySide), env.envelope);
    } catch {
      /* ignore */
    }
    const r = await call(active, UNDO, "commit_evidence", { transfer_id: id, envelope_sha256_hex: hash }, { gasTera: "30" });
    if (!r.ok) return setMsg({ kind: "error", text: r.error ?? "commit gagal", hash: r.hash });
    await upload(mySide, env.envelope, r.hash);
  }

  async function upload(side: Side, envelope: string, hash?: string) {
    const res = await fetch("/api/court/evidence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transferId: id, side, envelope }) });
    const body = await res.json();
    if (res.ok) {
      try {
        localStorage.removeItem(pendingKey(id, side));
      } catch {
        /* ignore */
      }
      setMsg({ kind: "ok", text: `Bukti terenkripsi terkirim. Server hanya menerima ciphertext ${envelope.slice(0, 24)}… (${envelope.length / 2} byte); hanya model di TEE yang bisa membukanya.`, hash });
      setText("");
    } else setMsg({ kind: "error", text: body.error ?? "upload gagal", hash });
    refreshT();
    refreshCourt();
  }

  async function runCourt(retryPaid = false) {
    setMsg({ kind: "info", text: "Sidang berjalan: cek attestation → 1 panggilan NEAR AI terenkripsi → tanda tangan TEE → kontrak memverifikasi…" });
    const res = await fetch("/api/court/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transferId: id, retryPaid }) });
    const raw = await res.text();
    let body: { error?: string; costUsd?: number; tx?: string } = {};
    try {
      body = JSON.parse(raw);
    } catch {
      body = { error: `HTTP ${res.status}: ${raw.slice(0, 160)}` };
    }
    setMsg(res.ok ? { kind: "ok", text: `Rekomendasi tersimpan on-chain (biaya inferensi ≈ $${(body.costUsd ?? 0).toFixed(5)}).`, hash: body.tx } : { kind: "error", text: body.error ?? `HTTP ${res.status}` });
    refreshT();
    refreshCourt();
  }

  async function applySilence() {
    if (!active) return;
    const r = await call(active, UNDO, "release_expired", { transfer_id: id }, { gasTera: "50" });
    setMsg(r.ok ? { kind: "ok", text: "Diamnya dewan diterapkan: keadaan yang dibantah tetap berlaku.", hash: r.hash } : { kind: "error", text: r.error ?? "gagal" });
    refreshT();
  }

  const leftover = mySide && typeof window !== "undefined" ? localStorage.getItem(pendingKey(id, mySide)) : null;
  const rec = d.recommendation;

  return (
    <div className="space-y-4">
      <Card title={`Sidang #${t.id}`} right={<StatusBadge status={t.status} />}>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <b>{fmt(t.amount)}</b> {t.kind === "Sweep" ? "rUSDC (sapu Panik)" : t.kind === "Exit" ? "USDC" : "rUSDC"}
            <div className="text-stone-500">
              {short(t.from)} → {short(t.to)}
            </div>
          </div>
          <div>
            <div>{d.origin === "Report" ? "Laporan penipuan dari pihak pengirim" : "Bantahan atas pembekuan Panik"}</div>
            <div className="text-stone-500">
              dibuka oleh {short(d.opened_by)} · “{d.reason}”
            </div>
          </div>
          <div className="text-xs text-stone-500">
            case nonce <span className="mono">{d.case_nonce}</span> (acak dari blok, mencegah putusan lama dipakai ulang)
          </div>
          <div className="text-xs text-stone-500">
            batas bukti: <Countdown ns={d.evidence_deadline} done="ditutup" /> · batas dewan: <Countdown ns={timeoutAt} done="habis" />
          </div>
        </div>
      </Card>

      <Card title="Bukti (terenkripsi ke model di TEE)">
        <ul className="mb-3 space-y-1 text-sm">
          {(["pengirim", "penerima"] as Side[]).map((s) => {
            const h = s === "pengirim" ? d.evidence_sender : d.evidence_receiver;
            return (
              <li key={s} className="flex flex-wrap items-center gap-2">
                <span className="w-24 font-medium capitalize">{s}</span>
                {h ? <Pill tone="ok">commit on-chain</Pill> : <Pill>belum</Pill>}
                {h && (court?.stored?.[s] ? <Pill tone="ok">ciphertext di server sidang</Pill> : <Pill tone="danger">belum diunggah</Pill>)}
                {h && <span className="mono text-xs text-stone-500">sha256 {h.slice(0, 16)}…</span>}
              </li>
            );
          })}
        </ul>
        {!active ? (
          <Notice kind="info">
            Buat dompet demo di <Link href="/dompet" className="underline">Dompet</Link> untuk ikut sidang.
          </Notice>
        ) : mySide && !slotFilled && evidenceOpen && t.status === "Disputed" ? (
          <div className="space-y-2">
            <p className="text-xs text-stone-500">
              Kamu pihak <b>{mySide}</b>. Teks ini dienkripsi di browser ke kunci model yang di-pin dewan ({short(cfg.court.signer ?? "")}). Server dan dewan tidak bisa membacanya.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder={mySide === "pengirim" ? "Contoh: saya transfer untuk HP bekas, penjual berhenti membalas dan tidak pernah memberi resi." : "Contoh: barang sudah dikirim, resi JNE …"}
              className="w-full rounded-lg border border-stone-300 bg-white p-2 text-sm dark:border-stone-700 dark:bg-stone-950"
            />
            <Button onClick={submitEvidence}>Enkripsi di browser & kirim</Button>
          </div>
        ) : mySide && slotFilled && leftover && !court?.stored?.[mySide] ? (
          <Button onClick={() => upload(mySide, leftover)}>Unggah ulang bukti terenkripsi</Button>
        ) : (
          <p className="text-xs text-stone-500">{mySide ? "Bukti dari sisimu sudah masuk." : "Akun aktif bukan pihak sengketa ini."}</p>
        )}
      </Card>

      <Card title="Rekomendasi AI (TEE, terverifikasi di kontrak)" tone={rec ? "accent" : undefined}>
        {rec ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold">{rec.rekomendasi === "kembalikan" ? "Kembalikan" : rec.rekomendasi === "lanjutkan" ? "Teruskan" : rec.rekomendasi}</span>
              <Pill>confidence {rec.confidence}</Pill>
              {rec.curiga_injeksi && <Pill tone="danger">upaya injeksi terdeteksi</Pill>}
            </div>
            <p>“{rec.alasan_publik}”</p>
            <p className="text-xs text-stone-500">
              Model {rec.model_id} · hash respons <span className="mono">{rec.response_hash.slice(0, 16)}…</span> {court?.run?.tx && <TxLink hash={court.run.tx} label="lihat transaksi post_recommendation" />}
            </p>
            <details className="text-xs text-stone-500">
              <summary className="cursor-pointer">Apa yang dibuktikan kontrak sebelum menyimpan ini?</summary>
              <ul className="mt-1 list-disc pl-5">
                <li>Tanda tangan TEE dari kunci model yang di-pin dewan (attestation dicek off-chain).</li>
                <li>Kontrak membangun ulang byte request dan cocok dengan hash yang ditandatangani: prompt resmi, berkas kasus ini (nonce acak), dan semua bukti yang di-commit, tidak lebih tidak kurang.</li>
                <li>Pesan sistem dibuka dengan kunci yang diturunkan kontrak sendiri (X25519), jadi server tidak bisa menipu dengan ciphertext ganda.</li>
                <li>Hanya field putusan yang dibuka; penalaran model dan isi bukti tetap terenkripsi.</li>
                <li>Rekomendasi tidak memindahkan uang. Dewan yang memutus.</li>
              </ul>
            </details>
          </div>
        ) : t.status !== "Disputed" ? (
          <p className="text-sm text-stone-500">Tidak ada rekomendasi (diputus tanpa sidang AI).</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-stone-600 dark:text-stone-300">
              {readyToJudge ? (allUploaded ? "Siap disidangkan." : "Menunggu ciphertext bukti diunggah ke server sidang.") : "Menunggu bukti kedua pihak (atau batas bukti lewat)."}
            </p>
            {court?.run?.status === "failed_after_paid_call" ? (
              <Button variant="ghost" onClick={() => runCourt(true)}>
                Coba lagi (panggilan NEAR AI baru, berbayar)
              </Button>
            ) : (
              <Button onClick={() => runCourt()} disabled={!readyToJudge || !allUploaded || court?.run?.status === "running"}>
                Jalankan sidang (1 panggilan NEAR AI)
              </Button>
            )}
            {court?.run?.status && court.run.status !== "done" && <p className="text-xs text-stone-500">status: {court.run.status} {court.run.error}</p>}
          </div>
        )}
      </Card>

      <Card title="Putusan">
        {decided ? (
          <div className="text-sm">
            <p>
              Diputus oleh <b>{d.decided_by === "council" ? "dewan (Sputnik DAO)" : d.decided_by === "timeout" ? "diamnya dewan (timeout)" : d.decided_by}</b>
              {t.final_to && <> · uang ke {short(t.final_to)}</>}
            </p>
            {d.council_reason && <p className="text-stone-500">Alasan publik: “{d.council_reason}”</p>}
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              Menunggu dewan. Kalau dewan diam sampai batasnya, {d.fallback_reverse ? "Panik tetap berlaku (uang ke akun pemulihan)" : t.kind === "Sweep" ? "uang tetap menuju akun pemulihan" : "uang diteruskan ke penerima"}.
            </p>
            <div className="flex gap-2">
              <Link href="/dewan" className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800">
                Ke halaman Dewan →
              </Link>
              {timedOut && active && (
                <Button variant="ghost" onClick={applySilence}>
                  Terapkan diamnya dewan
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      {msg && (
        <Notice kind={msg.kind}>
          {msg.text} <TxLink hash={msg.hash} />
        </Notice>
      )}
    </div>
  );
}
