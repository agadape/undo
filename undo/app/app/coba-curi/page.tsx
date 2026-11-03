"use client";
import { Card, Notice, Pill, StatusBadge, usePoll } from "@/components/ui";
import { ADDR } from "@/lib/config";
import { fmt, short } from "@/lib/near-client";
import type { BalanceView } from "@/lib/types";

type Stats = {
  contractId: string;
  demoId: string;
  guardId: string;
  locked: boolean;
  codeHash: string;
  windowSec: number;
  contestSec: number;
  balance: BalanceView;
  demoLocked: boolean;
  attempts: number;
  frozenNow: number;
  inDispute: number;
  reversed: number;
  escaped: string;
  saved: string;
  reactionSec: number[];
  recent: { id: string; kind: string; to: string; amount: string; status: string; created_at: string; final_to: string | null }[];
  heartbeat: { at: string; ok: boolean; error?: string } | null;
  publishedKey: string | null;
  error?: string;
};

export default function CobaCuriPage() {
  const [s] = usePoll(() => fetch("/api/cobacuri/stats").then((r) => r.json() as Promise<Stats>), [], 8000);
  if (!s) return <p className="text-sm text-stone-500">memuat tantangan…</p>;
  if (s.error) return <Notice kind="error">{s.error}</Notice>;
  const avgReact = s.reactionSec.length ? Math.round(s.reactionSec.reduce((a, b) => a + b, 0) / s.reactionSec.length) : null;
  const hbAge = s.heartbeat ? Math.round((Date.now() - Date.parse(s.heartbeat.at)) / 1000) : null;
  const target = BigInt(s.balance.available) + BigInt(s.balance.pending_in) + BigInt(s.balance.frozen_in);

  return (
    <div className="space-y-4">
      <section className="space-y-2 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Coba Curi</h1>
        <p className="text-lg">Kuncinya bisa dicuri. Uangnya tidak bisa dicairkan.</p>
        <p className="max-w-2xl text-sm text-stone-600 dark:text-stone-300">
          Kunci privat akun ini kami umumkan. Siapa pun boleh memakainya untuk mengirim, unwrap, atau mengganti akun pemulihannya. Setiap uang yang keluar menunggu {Math.round(s.windowSec / 60)} menit; penjaga (akun pemulihannya) menekan Panik, dan setelah {Math.round(s.contestSec / 60)} menit tanpa bantahan uangnya kembali.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Saldo umpan" value={`${fmt(target)} rUSDC`} />
        <Tile label="Percobaan" value={String(s.attempts)} />
        <Tile label="Berhasil dicairkan" value={`${fmt(s.escaped)} rUSDC`} tone={s.escaped === "0" ? "ok" : "danger"} />
        <Tile label="Reaksi penjaga (rata-rata)" value={avgReact === null ? "—" : `${avgReact} dtk`} />
      </div>

      <Card title="Status">
        <ul className="space-y-1 text-sm">
          <li className="flex flex-wrap items-center gap-2">
            Akun umpan:{" "}
            <a className="mono text-xs underline" href={ADDR(s.demoId)} target="_blank" rel="noreferrer">
              {s.demoId}
            </a>
            {s.demoLocked ? <Pill tone="danger">terkunci (ronde sedang dibereskan)</Pill> : <Pill tone="ok">terbuka</Pill>}
          </li>
          <li className="flex flex-wrap items-center gap-2">
            Kontrak tantangan: <span className="mono text-xs">{s.contractId}</span>
            <Pill tone={s.locked ? "ok" : "danger"}>{s.locked ? "terkunci, 0 key" : "masih punya key"}</Pill>
          </li>
          <li className="flex flex-wrap items-center gap-2">
            Penjaga: <span className="mono text-xs">{short(s.guardId)}</span>
            {hbAge === null ? <Pill>tidak ada heartbeat lokal</Pill> : <Pill tone={s.heartbeat?.ok && hbAge < 120 ? "ok" : "danger"}>terakhir aktif {hbAge} dtk lalu</Pill>}
          </li>
          <li>
            Diselamatkan sejauh ini: <b>{fmt(s.saved)} rUSDC</b> · sedang dibekukan: {s.frozenNow} · dalam sengketa: {s.inDispute}
          </li>
        </ul>
      </Card>

      <Card title="Kunci akun umpan">
        {s.publishedKey ? (
          <div className="space-y-2">
            <code className="mono block break-all rounded bg-stone-100 p-2 text-xs dark:bg-stone-950">{s.publishedKey}</code>
            <p className="text-xs text-stone-500">
              Contoh: <span className="mono">near tokens / near-api-js</span> → panggil <span className="mono">transfer</span>, <span className="mono">unwrap</span>, atau <span className="mono">send_usdc</span> di {s.contractId} (lampirkan 0,005 NEAR biaya storage).
            </p>
          </div>
        ) : (
          <p className="text-sm text-stone-500">Kunci akan dipublikasikan saat tantangan dibuka (diumumkan oleh tim).</p>
        )}
      </Card>

      <Card title="Percobaan terakhir">
        {s.recent.length === 0 ? (
          <p className="text-sm text-stone-500">Belum ada yang mencoba.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {s.recent.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <span className="mono text-xs text-stone-500">#{t.id}</span>
                <span className="tabular-nums">{fmt(t.amount)}</span>
                <span className="text-stone-500">{t.kind === "Exit" ? "USDC" : "rUSDC"} → {short(t.to)}</span>
                <StatusBadge status={t.status} />
                {t.final_to && <span className="text-xs text-stone-500">akhir: {short(t.final_to)}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Notice kind="info">
        Yang dibuktikan tantangan ini: Panik + jendela undo + penjaga membuat uang curian tidak bisa dicairkan. Yang <b>tidak</b> dibuktikan: bahwa akun tidak bisa dibobol. Kuncinya memang sengaja diberikan.
      </Notice>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "ok" | "danger" }) {
  const c = tone === "ok" ? "text-emerald-700 dark:text-emerald-400" : tone === "danger" ? "text-red-600" : "";
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900">
      <div className="text-xs text-stone-500">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${c}`}>{value}</div>
    </div>
  );
}
