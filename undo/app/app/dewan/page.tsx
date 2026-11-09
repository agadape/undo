"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Notice, Pill, StatusBadge, TxLink, btnClass, inputClass, usePoll } from "@/components/ui";
import { More, NextStep } from "@/components/visual";
import { ADDR, DAO, UNDO } from "@/lib/config";
import { useAccounts } from "@/components/accounts";
import { approvals, loadCouncil, rejections, type Council, type ResolveProposal } from "@/lib/council";
import { useFmt, useLang, useReason, useT } from "@/lib/i18n";
import { parseOutcome, short, view } from "@/lib/near-client";
import { playTimeFx } from "@/lib/timefx";
import type { Config, Transfer } from "@/lib/types";
import { walletFunctionCall } from "@/lib/wallet";

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
    <label className="block text-xs text-muted">
      🔑 {tr("Passcode dewan (khusus anggota; disimpan di browser ini)", "Council passcode (members only; saved in this browser)")}
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
        className={`${inputClass} mt-1 block w-full text-sm sm:w-64`}
      />
    </label>
  );
}

export default function DewanPage() {
  const tr = useT();
  const fmt = useFmt();
  const pickReason = useReason();
  const [items, refresh] = usePoll(loadDisputes, [], 5000);
  const [council, refreshCouncil] = usePoll(() => loadCouncil(view), [], 10000);
  const done = () => {
    refresh();
    refreshCouncil();
  };
  const open = items?.filter((t) => t.status === "Disputed") ?? [];
  const closed = items?.filter((t) => t.status !== "Disputed") ?? [];
  return (
    <div className="space-y-12 [overflow-wrap:anywhere] sm:space-y-16">
      <Card
        title={tr("Dewan", "Council")}
        right={
          <a className="text-sm font-semibold text-sky underline decoration-dotted underline-offset-4" href={ADDR(DAO)} target="_blank" rel="noreferrer">
            ⚖️ Sputnik DAO ↗
          </a>
        }
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
          {/* who votes */}
          <div className="min-w-0 rounded-[12px] bg-well p-4">
            <div className="text-sm font-semibold text-muted">{tr("Anggota", "Members")}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(council?.members ?? []).map((m) => (
                <span key={m} className="mono rounded-full bg-ink/10 px-2.5 py-1 text-xs">
                  👤 {short(m)}
                </span>
              ))}
            </div>
            {council && (
              <div className="serif mt-3 text-2xl leading-tight tabular-nums text-plum">
                {tr(`${council.needed} dari ${council.members.length} suara`, `${council.needed} of ${council.members.length} votes`)}
              </div>
            )}
          </div>
          <span aria-hidden className="hidden text-xl text-muted sm:block">
            ▶
          </span>
          {/* only two outcomes */}
          <div className="grid min-w-0 gap-3">
            <div className="rounded-[12px] bg-sky/10 p-4 text-sm font-semibold">
              <span className="text-sm font-semibold text-sky">◀◀</span> {tr("Kembali ke pihak pengirim", "Back to the sender's side")}
            </div>
            <div className="rounded-[12px] bg-well p-4 text-sm font-semibold">
              <span className="text-sm font-semibold text-ink">▶</span> {tr("Diteruskan ke penerima", "Paid to the receiver")}
            </div>
          </div>
        </div>
        <More label={tr("Cara kerja + passcode dewan", "How it works + council passcode")}>
          <p>
            {tr(
              "Setiap putusan = proposal + vote, terekam publik, dan hanya atas uang yang masih dalam sengketa. Tombol di kartu sengketa (dengan passcode) membuat usulan dan memberi suara atas nama anggota tim; anggota lain memberi suara dengan wallet-nya sendiri.",
              "Every decision is a proposal + vote, recorded publicly, and only for money that is still in dispute. The buttons on a dispute card (with the passcode) propose and vote as the team's member; other members vote with their own wallets.",
            )}
          </p>
          <PasscodeField />
        </More>
      </Card>
      {!items ? (
        <p className="text-sm text-muted">{tr("memuat sengketa…", "loading disputes…")}</p>
      ) : open.length === 0 ? (
        <NextStep
          icon="☕"
          tone="sky"
          label={tr("Sepi", "All quiet")}
          title={tr("Tidak ada sengketa yang menunggu", "No disputes are waiting")}
          sub={tr("Mau melihatnya? Di Dompet: kirim ke Penjual, lalu Riwayat → Laporkan penipuan.", "Want to see one? In the Wallet: send to a Seller, then History → Report fraud.")}
          action={
            <Link href="/dompet" className={btnClass("ghost", true)}>
              {tr("Buka Dompet", "Open Wallet")}
            </Link>
          }
        />
      ) : (
        <>
          <NextStep
            icon="⚖"
            tone="plum"
            label={tr("Untuk dewan", "For the council")}
            title={tr(`${open.length} sengketa menunggu putusan`, `${open.length} dispute${open.length > 1 ? "s" : ""} waiting for a decision`)}
            sub={tr("Baca rekomendasi AI, lalu pilih salah satu dari dua tombol. Hanya anggota (passcode atau wallet).", "Read the AI recommendation, then press one of the two buttons. Members only (passcode or wallet).")}
          />
          {open.map((t) => (
            <DisputeCard key={t.id} t={t} council={council} onDone={done} />
          ))}
        </>
      )}
      {closed.length > 0 && (
        <Card title={tr("Sudah diputus", "Decided")}>
          <ul className="space-y-4 text-sm">
            {closed.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <Link className="text-xs font-semibold text-sky underline decoration-dotted underline-offset-2" href={`/sidang/${t.id}`}>
                  #{t.id}
                </Link>
                <StatusBadge status={t.status} />
                <span className="text-sm font-semibold tabular-nums text-ink">{fmt(t.amount)}</span>
                <span className="text-muted">
                  {tr("oleh", "decided by")}{" "}
                  {t.dispute?.decided_by === "council" ? tr("dewan", "the council") : t.dispute?.decided_by === "timeout" ? tr("diamnya dewan", "council silence") : t.dispute?.decided_by} →{" "}
                  {t.final_to ? short(t.final_to) : "—"}
                </span>
                {t.dispute?.council_reason && <span className="text-muted">“{pickReason(t.dispute.council_reason)}”</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function DisputeCard({ t, council, onDone }: { t: Transfer; council: Council | undefined; onDone: () => void }) {
  const { wallet } = useAccounts();
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
    const body = (await res.json()) as { error?: string; proposalId?: number; status?: string; approvals?: number; needed?: number; voteTx?: string; proposalTx?: string };
    if (res.ok && body.status === "Approved" && reverse) playTimeFx("rewind");
    setMsg(
      !res.ok
        ? { kind: "error", text: body.error ?? tr("gagal", "failed") }
        : body.status === "Approved"
          ? { kind: "ok", text: tr(`Usulan #${body.proposalId} disetujui; kontrak mengeksekusi putusan.`, `Proposal #${body.proposalId} approved; the contract carries out the decision.`), hash: body.voteTx ?? body.proposalTx }
          : {
              kind: "ok",
              text: tr(
                `Usulan #${body.proposalId}: ${body.approvals} dari ${body.needed} suara. Menunggu anggota dewan lain memberi suara dengan wallet-nya di halaman ini.`,
                `Proposal #${body.proposalId}: ${body.approvals} of ${body.needed} votes. Waiting for another council member to vote with their wallet on this page.`,
              ),
              hash: body.voteTx ?? body.proposalTx,
            },
    );
    onDone();
  }

  // A council member votes with their own connected wallet (they sign; the DAO executes once enough approve).
  async function vote(p: ResolveProposal, approve: boolean) {
    try {
      const r = parseOutcome(await walletFunctionCall(DAO, "act_proposal", { id: p.id, action: approve ? "VoteApprove" : "VoteReject", proposal: p.kind }, 0n, 250));
      setMsg(r.ok ? { kind: "ok", text: approve ? tr(`Suara setuju untuk usulan #${p.id} terkirim.`, `Approval for proposal #${p.id} sent.`) : tr(`Suara tolak untuk usulan #${p.id} terkirim.`, `Rejection for proposal #${p.id} sent.`), hash: r.hash } : { kind: "error", text: r.error ?? tr("gagal", "failed"), hash: r.hash });
    } catch (e) {
      setMsg({ kind: "error", text: String((e as Error)?.message ?? e).slice(0, 200) });
    }
    onDone();
  }
  const proposals = (council?.proposals ?? []).filter((p) => p.transferId === t.id).sort((a, b) => b.id - a.id);
  const isMember = !!wallet && !!council?.members.includes(wallet.id);

  return (
    <Card
      title={
        <span className="flex min-w-0 flex-wrap items-center gap-2 normal-case">
          <Link href={`/sidang/${t.id}`} className="underline decoration-dotted underline-offset-4">
            {tr(`Sengketa #${t.id}`, `Dispute #${t.id}`)}
          </Link>
          <span className="font-sans text-sm font-semibold text-muted">{d.origin === "Report" ? tr("laporan penipuan", "fraud report") : tr("bantahan Panik", "contested panic")}</span>
        </span>
      }
      right={<span className="serif min-w-0 text-4xl leading-tight tabular-nums text-plum">❚❚ {fmt(t.amount)}</span>}
    >
      <p className="text-sm text-muted">
        {short(t.from)} → {short(t.to)} · {tr("dibuka oleh", "opened by")} {short(d.opened_by)}: “{d.reason}”
      </p>
      <div className="my-5 rounded-[12px] bg-well p-4 text-sm">
        {rec ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {lang === "en" ? (
                <>
                  <b>
                    TEE recommendation: {rec.rekomendasi === "kembalikan" ? "return to sender" : rec.rekomendasi === "lanjutkan" ? "pay the receiver" : rec.rekomendasi}
                  </b>
                  {(rec.rekomendasi === "kembalikan" || rec.rekomendasi === "lanjutkan") && <span className="mono text-xs text-muted">{`"rekomendasi":"${rec.rekomendasi}"`}</span>}
                </>
              ) : (
                <b>Rekomendasi TEE: {rec.rekomendasi}</b>
              )}
              <Pill>confidence {rec.confidence}</Pill>
              {rec.curiga_injeksi && <Pill tone="danger">{tr("injeksi terdeteksi", "injection detected")}</Pill>}
            </div>
            <p className="mt-1">
              {lang === "en" && <span className="text-xs text-muted">Public reason (written by the model): </span>}“{pickReason(rec.alasan_publik)}”
            </p>
          </>
        ) : (
          <span className="text-muted">{tr("Belum ada rekomendasi AI. Dewan tetap bisa memutus.", "No AI recommendation yet. The council can still decide.")}</span>
        )}
      </div>
      {proposals.length > 0 && (
        <div className="mb-5 space-y-3 text-sm">
          <b className="text-sm font-semibold text-muted">{tr("Usulan di DAO", "Proposals in the DAO")}</b>
          {proposals.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2">
              <a className="text-xs font-semibold text-sky underline decoration-dotted underline-offset-2" href={ADDR(DAO)} target="_blank" rel="noreferrer">
                #{p.id}
              </a>
              <span>{p.reverse ? (sweep ? tr("kembalikan ke pemilik", "return to the owner") : tr("kembalikan ke pengirim", "return to the sender")) : sweep ? tr("teruskan ke akun pemulihan", "release to the recovery account") : tr("teruskan ke penerima", "pay the receiver")}</span>
              <Pill tone={p.status === "Approved" ? "ok" : p.status === "InProgress" ? "neutral" : "danger"}>
                {p.status === "InProgress" ? tr(`${approvals(p)} dari ${council?.needed ?? "?"} suara`, `${approvals(p)} of ${council?.needed ?? "?"} votes`) : p.status}
              </Pill>
              {rejections(p) > 0 && <span className="text-xs text-muted">{tr(`${rejections(p)} menolak`, `${rejections(p)} against`)}</span>}
              <span className="text-xs text-muted">
                {Object.entries(p.votes)
                  .map(([who, v]) => `${short(who)}: ${v === "Approve" ? tr("setuju", "for") : tr("tolak", "against")}`)
                  .join(" · ")}
              </span>
              {p.status === "InProgress" && isMember && !p.votes[wallet!.id] && (
                <>
                  <Button small onClick={() => vote(p, true)}>
                    {tr("Setuju (wallet)", "Approve (wallet)")}
                  </Button>
                  <Button small variant="ghost" onClick={() => vote(p, false)}>
                    {tr("Tolak (wallet)", "Reject (wallet)")}
                  </Button>
                </>
              )}
            </div>
          ))}
          {proposals.some((p) => p.status === "InProgress") && !isMember && (
            <p className="text-xs text-muted">
              {wallet
                ? tr(`Wallet ${short(wallet.id)} bukan anggota dewan.`, `Wallet ${short(wallet.id)} is not on the council.`)
                : tr("Anggota dewan: hubungkan wallet (kanan atas) untuk memberi suara.", "Council members: connect your wallet (top right) to vote.")}
            </p>
          )}
        </div>
      )}
      <label className="block text-xs text-muted">
        {tr("Alasan publik putusan", "Public reason for the decision")}
        <input value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputClass} mt-1 block w-full text-sm`} />
      </label>
      <div className="mt-5 flex flex-wrap gap-3">
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
