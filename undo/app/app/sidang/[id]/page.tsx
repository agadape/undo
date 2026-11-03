"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAccounts } from "@/components/accounts";
import { Button, Card, Countdown, Notice, Pill, StatusBadge, TxLink, usePoll } from "@/components/ui";
import { UNDO } from "@/lib/config";
import { encryptTo, sha256hex, type Side } from "@/lib/court";
import { useFmt, useLang, useT } from "@/lib/i18n";
import { call, short, view } from "@/lib/near-client";
import type { AccountView, Config, Transfer } from "@/lib/types";

type CourtStatus = { stored: Record<Side, boolean>; run: { status: string; tx?: string; costUsd?: number; error?: string; requestBytes?: number } | null };
const pendingKey = (id: string, side: Side) => `undo.evidence.${id}.${side}`;

export default function SidangPage() {
  const { id } = useParams<{ id: string }>();
  const tr = useT();
  const lang = useLang();
  const fmt = useFmt();
  const { active } = useAccounts();
  const [cfg] = usePoll(() => view<Config>(UNDO, "get_config"), [], 15000);
  const [t, refreshT] = usePoll(() => view<Transfer | null>(UNDO, "get_transfer", { transfer_id: id }), [id], 5000);
  const [senderAcct] = usePoll(() => (t ? view<AccountView>(UNDO, "get_account", { account_id: t.from }) : Promise.resolve(undefined)), [t?.from], 20000);
  const [court, refreshCourt] = usePoll(() => fetch(`/api/court/evidence?id=${id}`).then((r) => r.json() as Promise<CourtStatus>), [id], 6000);
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "info"; text: string; hash?: string }>();
  const [text, setText] = useState("");

  if (!t || !cfg) return <p className="text-sm text-stone-500">{tr(`memuat sidang #${id}…`, `loading court case #${id}…`)}</p>;
  const d = t.dispute;
  if (!d) return <Notice kind="info">{tr(`Transfer #${id} tidak (pernah) disengketakan.`, `Transfer #${id} has never been disputed.`)}</Notice>;

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
    if (text.trim().length < 5) return setMsg({ kind: "error", text: tr("tulis bukti dulu", "write your evidence first") });
    const env = encryptTo(cfg.court.signer, text.trim());
    const hash = sha256hex(env.envelope);
    try {
      localStorage.setItem(pendingKey(id, mySide), env.envelope);
    } catch {
      /* ignore */
    }
    const r = await call(active, UNDO, "commit_evidence", { transfer_id: id, envelope_sha256_hex: hash }, { gasTera: "30" });
    if (!r.ok) return setMsg({ kind: "error", text: r.error ?? tr("commit gagal", "commit failed"), hash: r.hash });
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
      setMsg({
        kind: "ok",
        text: tr(
          `Bukti terenkripsi terkirim. Server hanya menerima ciphertext ${envelope.slice(0, 24)}… (${envelope.length / 2} byte); hanya model di TEE yang bisa membukanya.`,
          `Encrypted evidence sent. The server only received ciphertext ${envelope.slice(0, 24)}… (${envelope.length / 2} bytes); only the model in the TEE can open it.`,
        ),
        hash,
      });
      setText("");
    } else setMsg({ kind: "error", text: body.error ?? tr("upload gagal", "upload failed"), hash });
    refreshT();
    refreshCourt();
  }

  async function runCourt(retryPaid = false) {
    setMsg({
      kind: "info",
      text: tr(
        "Sidang berjalan: cek attestation → 1 panggilan NEAR AI terenkripsi → tanda tangan TEE → kontrak memverifikasi…",
        "Court running: check attestation → 1 encrypted NEAR AI call → TEE signature → contract verifies…",
      ),
    });
    const res = await fetch("/api/court/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transferId: id, retryPaid }) });
    const raw = await res.text();
    let body: { error?: string; costUsd?: number; tx?: string } = {};
    try {
      body = JSON.parse(raw);
    } catch {
      body = { error: `HTTP ${res.status}: ${raw.slice(0, 160)}` };
    }
    setMsg(
      res.ok
        ? {
            kind: "ok",
            text: tr(
              `Rekomendasi tersimpan on-chain (biaya inferensi ≈ $${(body.costUsd ?? 0).toFixed(5)}).`,
              `Recommendation stored on-chain (inference cost ≈ $${(body.costUsd ?? 0).toFixed(5)}).`,
            ),
            hash: body.tx,
          }
        : { kind: "error", text: body.error ?? `HTTP ${res.status}` },
    );
    refreshT();
    refreshCourt();
  }

  async function applySilence() {
    if (!active) return;
    const r = await call(active, UNDO, "release_expired", { transfer_id: id }, { gasTera: "50" });
    setMsg(
      r.ok
        ? { kind: "ok", text: tr("Diamnya dewan diterapkan: keadaan yang dibantah tetap berlaku.", "Council silence applied: the contested state stays in effect."), hash: r.hash }
        : { kind: "error", text: r.error ?? tr("gagal", "failed") },
    );
    refreshT();
  }

  const leftover = mySide && typeof window !== "undefined" ? localStorage.getItem(pendingKey(id, mySide)) : null;
  const rec = d.recommendation;

  return (
    <div className="space-y-4">
      <Card title={tr(`Sidang #${t.id}`, `Court case #${t.id}`)} right={<StatusBadge status={t.status} />}>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <b>{fmt(t.amount)}</b> {t.kind === "Sweep" ? tr("rUSDC (sapu Panik)", "rUSDC (panic sweep)") : t.kind === "Exit" ? "USDC" : "rUSDC"}
            <div className="text-stone-500">
              {short(t.from)} → {short(t.to)}
            </div>
          </div>
          <div>
            <div>{d.origin === "Report" ? tr("Laporan penipuan dari pihak pengirim", "Fraud report from the sender's side") : tr("Bantahan atas pembekuan Panik", "Contest of a panic freeze")}</div>
            <div className="text-stone-500">
              {tr("dibuka oleh", "opened by")} {short(d.opened_by)} · “{d.reason}”
            </div>
          </div>
          <div className="text-xs text-stone-500">
            case nonce <span className="mono">{d.case_nonce}</span> ({tr("acak dari blok, mencegah putusan lama dipakai ulang", "random from the block; stops an old decision from being reused")})
          </div>
          <div className="text-xs text-stone-500">
            {tr("batas bukti", "evidence deadline")}: <Countdown ns={d.evidence_deadline} done={tr("ditutup", "closed")} /> · {tr("batas dewan", "council deadline")}:{" "}
            <Countdown ns={timeoutAt} done={tr("habis", "expired")} />
          </div>
        </div>
      </Card>

      <Card title={tr("Bukti (terenkripsi ke model di TEE)", "Evidence (encrypted to the model in the TEE)")}>
        <ul className="mb-3 space-y-1 text-sm">
          {(["pengirim", "penerima"] as Side[]).map((s) => {
            const h = s === "pengirim" ? d.evidence_sender : d.evidence_receiver;
            return (
              <li key={s} className="flex flex-wrap items-center gap-2">
                <span className="w-24 font-medium capitalize">{s === "pengirim" ? tr("pengirim", "sender") : tr("penerima", "receiver")}</span>
                {h ? <Pill tone="ok">commit on-chain</Pill> : <Pill>{tr("belum", "not yet")}</Pill>}
                {h && (court?.stored?.[s] ? <Pill tone="ok">{tr("ciphertext di server sidang", "ciphertext on the court server")}</Pill> : <Pill tone="danger">{tr("belum diunggah", "not uploaded")}</Pill>)}
                {h && <span className="mono text-xs text-stone-500">sha256 {h.slice(0, 16)}…</span>}
              </li>
            );
          })}
        </ul>
        {!active ? (
          <Notice kind="info">
            {lang === "en" ? (
              <>
                Create a demo wallet on the <Link href="/dompet" className="underline">Wallet</Link> page to take part in the court case.
              </>
            ) : (
              <>
                Buat dompet demo di <Link href="/dompet" className="underline">Dompet</Link> untuk ikut sidang.
              </>
            )}
          </Notice>
        ) : mySide && !slotFilled && evidenceOpen && t.status === "Disputed" ? (
          <div className="space-y-2">
            <p className="text-xs text-stone-500">
              {lang === "en" ? (
                <>
                  You are on the <b>{mySide === "pengirim" ? "sender's" : "receiver's"}</b> side. This text is encrypted in your browser to the model key pinned by the council ({short(cfg.court.signer ?? "")}). Neither the server nor the council can read it.
                </>
              ) : (
                <>
                  Kamu pihak <b>{mySide}</b>. Teks ini dienkripsi di browser ke kunci model yang di-pin dewan ({short(cfg.court.signer ?? "")}). Server dan dewan tidak bisa membacanya.
                </>
              )}
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder={
                mySide === "pengirim"
                  ? tr(
                      "Contoh: saya transfer untuk HP bekas, penjual berhenti membalas dan tidak pernah memberi resi.",
                      "Example: I paid for a used phone; the seller stopped replying and never sent a tracking number.",
                    )
                  : tr("Contoh: barang sudah dikirim, resi JNE …", "Example: the item has been shipped, JNE tracking number …")
              }
              className="w-full rounded-lg border border-stone-300 bg-white p-2 text-sm dark:border-stone-700 dark:bg-stone-950"
            />
            <Button onClick={submitEvidence}>{tr("Enkripsi di browser & kirim", "Encrypt in browser & send")}</Button>
          </div>
        ) : mySide && slotFilled && leftover && !court?.stored?.[mySide] ? (
          <Button onClick={() => upload(mySide, leftover)}>{tr("Unggah ulang bukti terenkripsi", "Re-upload encrypted evidence")}</Button>
        ) : (
          <p className="text-xs text-stone-500">
            {mySide ? tr("Bukti dari sisimu sudah masuk.", "Evidence from your side has been received.") : tr("Akun aktif bukan pihak sengketa ini.", "The active account is not a party to this dispute.")}
          </p>
        )}
      </Card>

      <Card title={tr("Rekomendasi AI (TEE, terverifikasi di kontrak)", "AI recommendation (TEE, verified by the contract)")} tone={rec ? "accent" : undefined}>
        {rec ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold">
                {rec.rekomendasi === "kembalikan" ? tr("Kembalikan", "Return to sender") : rec.rekomendasi === "lanjutkan" ? tr("Teruskan", "Pay the receiver") : rec.rekomendasi}
              </span>
              {lang === "en" && (rec.rekomendasi === "kembalikan" || rec.rekomendasi === "lanjutkan") && (
                <span className="mono text-xs text-stone-500">{`"rekomendasi":"${rec.rekomendasi}"`}</span>
              )}
              <Pill>confidence {rec.confidence}</Pill>
              {rec.curiga_injeksi && <Pill tone="danger">{tr("upaya injeksi terdeteksi", "injection attempt detected")}</Pill>}
            </div>
            <p>
              {lang === "en" && <span className="text-xs text-stone-500">Public reason (written by the model): </span>}“{rec.alasan_publik}”
            </p>
            <p className="text-xs text-stone-500">
              Model {rec.model_id} · {tr("hash respons", "response hash")} <span className="mono">{rec.response_hash.slice(0, 16)}…</span>{" "}
              {court?.run?.tx && <TxLink hash={court.run.tx} label={tr("lihat transaksi post_recommendation", "view the post_recommendation transaction")} />}
            </p>
            <details className="text-xs text-stone-500">
              <summary className="cursor-pointer">{tr("Apa yang dibuktikan kontrak sebelum menyimpan ini?", "What does the contract verify before storing this?")}</summary>
              <ul className="mt-1 list-disc pl-5">
                <li>{tr("Tanda tangan TEE dari kunci model yang di-pin dewan (attestation dicek off-chain).", "A TEE signature from the model key pinned by the council (the attestation is checked off-chain).")}</li>
                <li>
                  {tr(
                    "Kontrak membangun ulang byte request dan cocok dengan hash yang ditandatangani: prompt resmi, berkas kasus ini (nonce acak), dan semua bukti yang di-commit, tidak lebih tidak kurang.",
                    "The contract rebuilds the request bytes and checks that they match the signed hash: the official prompt, this case file (random nonce) and all committed evidence, nothing more and nothing less.",
                  )}
                </li>
                <li>
                  {tr(
                    "Pesan sistem dibuka dengan kunci yang diturunkan kontrak sendiri (X25519), jadi server tidak bisa menipu dengan ciphertext ganda.",
                    "The system message is decrypted with a key the contract derives itself (X25519), so the server cannot cheat with a ciphertext that decrypts to different text under another key.",
                  )}
                </li>
                <li>{tr("Hanya field putusan yang dibuka; penalaran model dan isi bukti tetap terenkripsi.", "Only the decision field is decrypted; the model's reasoning and the evidence stay encrypted.")}</li>
                <li>{tr("Rekomendasi tidak memindahkan uang. Dewan yang memutus.", "The recommendation does not move money. The council decides.")}</li>
              </ul>
            </details>
          </div>
        ) : t.status !== "Disputed" ? (
          <p className="text-sm text-stone-500">{tr("Tidak ada rekomendasi (diputus tanpa sidang AI).", "No recommendation (decided without the AI court).")}</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-stone-600 dark:text-stone-300">
              {readyToJudge
                ? allUploaded
                  ? tr("Siap disidangkan.", "Ready for the court.")
                  : tr("Menunggu ciphertext bukti diunggah ke server sidang.", "Waiting for the evidence ciphertext to be uploaded to the court server.")
                : tr("Menunggu bukti kedua pihak (atau batas bukti lewat).", "Waiting for evidence from both sides (or for the evidence deadline to pass).")}
            </p>
            {court?.run?.status === "failed_after_paid_call" ? (
              <Button variant="ghost" onClick={() => runCourt(true)}>
                {tr("Coba lagi (panggilan NEAR AI baru, berbayar)", "Retry (new NEAR AI call, paid)")}
              </Button>
            ) : (
              <Button onClick={() => runCourt()} disabled={!readyToJudge || !allUploaded || court?.run?.status === "running"}>
                {tr("Jalankan sidang (1 panggilan NEAR AI)", "Run the court (1 NEAR AI call)")}
              </Button>
            )}
            {court?.run?.status && court.run.status !== "done" && <p className="text-xs text-stone-500">status: {court.run.status} {court.run.error}</p>}
          </div>
        )}
      </Card>

      <Card title={tr("Putusan", "Decision")}>
        {decided ? (
          <div className="text-sm">
            <p>
              {tr("Diputus oleh", "Decided by")}{" "}
              <b>{d.decided_by === "council" ? tr("dewan (Sputnik DAO)", "the council (Sputnik DAO)") : d.decided_by === "timeout" ? tr("diamnya dewan (timeout)", "council silence (timeout)") : d.decided_by}</b>
              {t.final_to && <> · {tr("uang ke", "money to")} {short(t.final_to)}</>}
            </p>
            {d.council_reason && (
              <p className="text-stone-500">
                {tr("Alasan publik", "Public reason")}: “{d.council_reason}”
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              {tr("Menunggu dewan. Kalau dewan diam sampai batasnya,", "Waiting for the council. If the council stays silent until its deadline,")}{" "}
              {d.fallback_reverse
                ? tr("Panik tetap berlaku (uang ke akun pemulihan)", "the panic stays in effect (money goes to the recovery account)")
                : t.kind === "Sweep"
                  ? tr("uang tetap menuju akun pemulihan", "the money still goes to the recovery account")
                  : tr("uang diteruskan ke penerima", "the money is paid to the receiver")}
              .
            </p>
            <div className="flex gap-2">
              <Link href="/dewan" className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800">
                {tr("Ke halaman Dewan →", "Go to the Council page →")}
              </Link>
              {timedOut && active && (
                <Button variant="ghost" onClick={applySilence}>
                  {tr("Terapkan diamnya dewan", "Apply council silence")}
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
