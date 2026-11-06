"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Notice, Pill, StatusBadge, TxLink, inputClass, usePoll } from "@/components/ui";
import { More } from "@/components/visual";
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
    <div className="space-y-4">
      <Card
        title={tr("Dewan", "Council")}
        right={
          <a className="osd text-lg leading-none text-phosphor underline decoration-dotted underline-offset-4" href={ADDR(DAO)} target="_blank" rel="noreferrer">
            ⚖️ Sputnik DAO ↗
          </a>
        }
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          {/* who votes */}
          <div className="rounded-[2px] border border-line bg-well p-3">
            <div className="osd text-lg leading-5 text-muted">{tr("Anggota", "Members")}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(council?.members ?? []).map((m) => (
                <span key={m} className="mono rounded-[2px] bg-ink/10 px-1.5 py-0.5 text-xs">
                  👤 {short(m)}
                </span>
              ))}
            </div>
            {council && (
              <div className="osd rgb mt-2 text-2xl leading-none text-plum">
                {tr(`${council.needed} dari ${council.members.length} suara`, `${council.needed} of ${council.members.length} votes`)}
              </div>
            )}
          </div>
          <span aria-hidden className="osd hidden text-3xl text-muted sm:block">
            ▶
          </span>
          {/* only two outcomes */}
          <div className="grid gap-2">
            <div className="rounded-[2px] border border-phosphor/50 bg-phosphor/5 px-3 py-2 text-sm font-semibold">
              <span className="osd text-xl text-phosphor">◀◀</span> {tr("Kembali ke pihak pengirim", "Back to the sender's side")}
            </div>
            <div className="rounded-[2px] border border-line-2 bg-well px-3 py-2 text-sm font-semibold">
              <span className="osd text-xl text-ink">▶</span> {tr("Diteruskan ke penerima", "Paid to the receiver")}
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
        <Notice kind="info">{tr("Tidak ada sengketa yang menunggu.", "No disputes are waiting.")}</Notice>
      ) : (
        open.map((t) => <DisputeCard key={t.id} t={t} council={council} onDone={done} />)
      )}
      {closed.length > 0 && (
        <Card title={tr("Sudah diputus", "Decided")}>
          <ul className="space-y-1 text-sm">
            {closed.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <Link className="mono text-xs text-phosphor underline decoration-dotted underline-offset-2" href={`/sidang/${t.id}`}>
                  #{t.id}
                </Link>
                <StatusBadge status={t.status} />
                <span className="osd text-xl leading-none tabular-nums">{fmt(t.amount)}</span>
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
        <span className="flex items-center gap-2 normal-case">
          <Link href={`/sidang/${t.id}`} className="underline decoration-dotted underline-offset-4">
            {tr(`Sengketa #${t.id}`, `Dispute #${t.id}`)}
          </Link>
          <span className="text-muted">{d.origin === "Report" ? tr("laporan penipuan", "fraud report") : tr("bantahan Panik", "contested panic")}</span>
        </span>
      }
      right={<span className="osd rgb text-3xl leading-none tabular-nums text-plum">❚❚ {fmt(t.amount)}</span>}
    >
      <p className="text-sm text-muted">
        {short(t.from)} → {short(t.to)} · {tr("dibuka oleh", "opened by")} {short(d.opened_by)}: “{d.reason}”
      </p>
      <div className="my-3 rounded-[2px] border border-line bg-well p-3 text-sm">
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
        <div className="mb-3 space-y-1 text-sm">
          <b className="osd text-lg font-normal leading-5 text-muted">{tr("Usulan di DAO", "Proposals in the DAO")}</b>
          {proposals.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2">
              <a className="mono text-xs text-phosphor underline decoration-dotted underline-offset-2" href={ADDR(DAO)} target="_blank" rel="noreferrer">
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
