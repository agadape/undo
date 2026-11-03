"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Notice, Pill, StatusBadge, TxLink, usePoll } from "@/components/ui";
import { ADDR, DAO, UNDO } from "@/lib/config";
import { useFmt, useLang, useReason, useT } from "@/lib/i18n";
import { short, view } from "@/lib/near-client";
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
  const tr = useT();
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
      {tr("Passcode dewan (hanya untuk anggota dewan; disimpan di browser ini)", "Council passcode (for council members only; saved in this browser)")}
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
  const tr = useT();
  const fmt = useFmt();
  const pickReason = useReason();
  const [items, refresh] = usePoll(loadDisputes, [], 5000);
  const open = items?.filter((t) => t.status === "Disputed") ?? [];
  const closed = items?.filter((t) => t.status !== "Disputed") ?? [];
  return (
    <div className="space-y-4">
      <Card title={tr("Dewan", "Council")}>
        <p className="text-sm text-stone-600 dark:text-stone-300">
          {tr("Dewan adalah", "The council is a")}{" "}
          <a className="underline" href={ADDR(DAO)} target="_blank" rel="noreferrer">
            Sputnik DAO
          </a>
          {tr(
            ". Setiap putusan = proposal + vote, terekam publik. Dewan hanya bisa memilih A atau B (uang kembali ke pihak pengirim, atau diteruskan ke penerima) dan hanya atas uang yang masih dalam sengketa. Selama hackathon anggotanya tim kami; tombol di bawah membuat proposal dan vote atas nama anggota itu.",
            ". Every decision is a proposal + vote, recorded publicly. The council can only choose A or B (money back to the sender's side, or paid to the receiver), and only for money that is still in dispute. During the hackathon the members are our team; the buttons below create the proposal and vote on behalf of that member.",
          )}
        </p>
        <PasscodeField />
      </Card>
      {!items ? (
        <p className="text-sm text-stone-500">{tr("memuat sengketa…", "loading disputes…")}</p>
      ) : open.length === 0 ? (
        <Notice kind="info">{tr("Tidak ada sengketa yang menunggu.", "No disputes are waiting.")}</Notice>
      ) : (
        open.map((t) => <DisputeCard key={t.id} t={t} onDone={refresh} />)
      )}
      {closed.length > 0 && (
        <Card title={tr("Sudah diputus", "Decided")}>
          <ul className="space-y-1 text-sm">
            {closed.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <Link className="mono text-xs underline" href={`/sidang/${t.id}`}>
                  #{t.id}
                </Link>
                <StatusBadge status={t.status} />
                <span>{fmt(t.amount)}</span>
                <span className="text-stone-500">
                  {tr("oleh", "decided by")}{" "}
                  {t.dispute?.decided_by === "council" ? tr("dewan", "the council") : t.dispute?.decided_by === "timeout" ? tr("diamnya dewan", "council silence") : t.dispute?.decided_by} →{" "}
                  {t.final_to ? short(t.final_to) : "—"}
                </span>
                {t.dispute?.council_reason && <span className="text-stone-500">“{pickReason(t.dispute.council_reason)}”</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function DisputeCard({ t, onDone }: { t: Transfer; onDone: () => void }) {
  const tr = useT();
  const lang = useLang();
  const pickReason = useReason();
  const fmt = useFmt();
  const d = t.dispute!;
  const rec = d.recommendation;
  const [reason, setReason] = useState(rec ? (tr("Mengikuti rekomendasi TEE: ", "Following the TEE recommendation: ") + pickReason(rec.alasan_publik)).slice(0, 280) : "");
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
    setMsg(
      res.ok
        ? { kind: "ok", text: tr("Proposal dibuat dan disetujui; kontrak mengeksekusi putusan.", "Proposal created and approved; the contract carries out the decision."), hash: body.voteTx }
        : { kind: "error", text: body.error ?? tr("gagal", "failed") },
    );
    onDone();
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2 normal-case">
          <Link href={`/sidang/${t.id}`} className="underline">
            {tr(`Sengketa #${t.id}`, `Dispute #${t.id}`)}
          </Link>
          <span className="text-stone-500">{d.origin === "Report" ? tr("laporan penipuan", "fraud report") : tr("bantahan Panik", "contested panic")}</span>
        </span>
      }
      right={<span className="font-semibold tabular-nums">{fmt(t.amount)}</span>}
    >
      <p className="text-sm text-stone-500">
        {short(t.from)} → {short(t.to)} · {tr("dibuka oleh", "opened by")} {short(d.opened_by)}: “{d.reason}”
      </p>
      <div className="my-3 rounded-lg bg-stone-50 p-3 text-sm dark:bg-stone-950">
        {rec ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {lang === "en" ? (
                <>
                  <b>
                    TEE recommendation: {rec.rekomendasi === "kembalikan" ? "return to sender" : rec.rekomendasi === "lanjutkan" ? "pay the receiver" : rec.rekomendasi}
                  </b>
                  {(rec.rekomendasi === "kembalikan" || rec.rekomendasi === "lanjutkan") && <span className="mono text-xs text-stone-500">{`"rekomendasi":"${rec.rekomendasi}"`}</span>}
                </>
              ) : (
                <b>Rekomendasi TEE: {rec.rekomendasi}</b>
              )}
              <Pill>confidence {rec.confidence}</Pill>
              {rec.curiga_injeksi && <Pill tone="danger">{tr("injeksi terdeteksi", "injection detected")}</Pill>}
            </div>
            <p className="mt-1">
              {lang === "en" && <span className="text-xs text-stone-500">Public reason (written by the model): </span>}“{pickReason(rec.alasan_publik)}”
            </p>
          </>
        ) : (
          <span className="text-stone-500">{tr("Belum ada rekomendasi AI. Dewan tetap bisa memutus.", "No AI recommendation yet. The council can still decide.")}</span>
        )}
      </div>
      <label className="block text-xs text-stone-500">
        {tr("Alasan publik putusan", "Public reason for the decision")}
        <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-950" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => decide(true)}>{sweep ? tr("Kembalikan ke pemilik akun", "Return to the account owner") : tr("Kembalikan ke pihak pengirim", "Return to the sender's side")}</Button>
        <Button variant="ghost" onClick={() => decide(false)}>
          {sweep ? tr("Teruskan ke akun pemulihan", "Release to the recovery account") : tr("Teruskan ke penerima", "Pay the receiver")}
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
