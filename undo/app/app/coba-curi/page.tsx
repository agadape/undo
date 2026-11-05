"use client";
import { Card, Notice, Pill, StatusBadge, usePoll } from "@/components/ui";
import { ADDR, GUARD_HEARTBEAT_URL, GUARD_RUNS_API } from "@/lib/config";
import { useFmt, useLang, useT } from "@/lib/i18n";
import { short } from "@/lib/near-client";
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

type GuardRun = { at: string; ok: boolean; url: string } | null;

/** Last finished run of the guard workflow, read from the public GitHub API in the browser
 * (no token; 404 while the repo is private). Polled every 5 minutes. */
async function loadGuardRun(): Promise<GuardRun> {
  const r = await fetch(GUARD_RUNS_API, { headers: { Accept: "application/vnd.github+json" } });
  if (!r.ok) return null;
  const run = ((await r.json()) as { workflow_runs?: { updated_at: string; conclusion: string; html_url: string }[] }).workflow_runs?.[0];
  return run ? { at: run.updated_at, ok: run.conclusion === "success", url: run.html_url } : null;
}

export default function CobaCuriPage() {
  const t = useT();
  const lang = useLang();
  const fmt = useFmt();
  const [s] = usePoll(() => fetch("/api/cobacuri/stats").then((r) => r.json() as Promise<Stats>), [], 8000);
  const [gh] = usePoll(loadGuardRun, [], 5 * 60_000);
  // Primary guard: the Cloudflare Worker writes a heartbeat every 2 minutes.
  const [cf] = usePoll(() => fetch(GUARD_HEARTBEAT_URL, { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<{ at: string; ok: boolean } | null>) : null)), [], 60_000);
  const ago = (sec: number) => (sec < 120 ? t(`${sec} dtk`, `${sec} s`) : t(`${Math.round(sec / 60)} mnt`, `${Math.round(sec / 60)} min`));
  if (!s) return <p className="text-sm text-stone-500">{t("memuat tantangan…", "loading the challenge…")}</p>;
  if (s.error) return <Notice kind="error">{s.error}</Notice>;
  const avgReact = s.reactionSec.length ? Math.round(s.reactionSec.reduce((a, b) => a + b, 0) / s.reactionSec.length) : null;
  const hbAge = s.heartbeat ? Math.round((Date.now() - Date.parse(s.heartbeat.at)) / 1000) : null;
  const ghAge = gh ? Math.round((Date.now() - Date.parse(gh.at)) / 1000) : null;
  const cfAge = cf ? Math.round((Date.now() - Date.parse(cf.at)) / 1000) : null;
  const target = BigInt(s.balance.available) + BigInt(s.balance.pending_in) + BigInt(s.balance.frozen_in);

  return (
    <div className="space-y-4">
      <section className="space-y-2 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("Coba Curi", "Coba Curi (try to steal)")}</h1>
        <p className="text-lg">{t("Kuncinya bisa dicuri. Uangnya tidak bisa dicairkan.", "The key can be stolen. The money cannot be cashed out.")}</p>
        <p className="max-w-2xl text-sm text-stone-600 dark:text-stone-300">
          {lang === "en" ? (
            <>
              {s.publishedKey ? "We publish this account's private key." : "The team will publish this account's private key when the challenge opens."} Anyone holding it may send, unwrap, or change the account&apos;s recovery account. All money going out waits {Math.round(s.windowSec / 60)} min; the guard (the account&apos;s recovery account) presses Panic, and after {Math.round(s.contestSec / 60)} min with no contest the money comes back.
            </>
          ) : (
            <>
              {s.publishedKey ? "Kunci privat akun ini kami umumkan." : "Kunci privat akun ini akan diumumkan tim saat tantangan dibuka."} Siapa pun yang memegangnya boleh mengirim, unwrap, atau mengganti akun pemulihannya. Setiap uang yang keluar menunggu {Math.round(s.windowSec / 60)} menit; penjaga (akun pemulihannya) menekan Panik, dan setelah {Math.round(s.contestSec / 60)} menit tanpa bantahan uangnya kembali.
            </>
          )}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={t("Saldo umpan", "Bait balance")} value={`${fmt(target)} rUSDC`} />
        <Tile label={t("Percobaan", "Attempts")} value={String(s.attempts)} />
        <Tile label={t("Berhasil dicairkan", "Cashed out")} value={`${fmt(s.escaped)} rUSDC`} tone={s.escaped === "0" ? "ok" : "danger"} />
        <Tile label={t("Reaksi penjaga (rata-rata)", "Guard reaction (average)")} value={avgReact === null ? "—" : t(`${avgReact} dtk`, `${avgReact} s`)} />
      </div>

      <Card title="Status">
        <ul className="space-y-1 text-sm">
          <li className="flex flex-wrap items-center gap-2">
            {t("Akun umpan:", "Bait account:")}{" "}
            <a className="mono text-xs underline" href={ADDR(s.demoId)} target="_blank" rel="noreferrer">
              {s.demoId}
            </a>
            {s.demoLocked ? <Pill tone="danger">{t("terkunci (ronde sedang dibereskan)", "locked (round being cleaned up)")}</Pill> : <Pill tone="ok">{t("terbuka", "open")}</Pill>}
          </li>
          <li className="flex flex-wrap items-center gap-2">
            {t("Kontrak tantangan:", "Challenge contract:")} <span className="mono text-xs">{s.contractId}</span>
            <Pill tone={s.locked ? "ok" : "danger"}>{s.locked ? t("terkunci, 0 key", "locked, 0 keys") : t("masih punya key", "still has keys")}</Pill>
          </li>
          <li className="flex flex-wrap items-center gap-2">
            {t("Penjaga:", "Guard:")} <span className="mono text-xs">{short(s.guardId)}</span>
            {cf && cfAge !== null ? (
              // Written every 2 minutes, so 5 minutes without one means the Worker stopped.
              <Pill tone={cf.ok && cfAge < 300 ? "ok" : "danger"}>
                {t(`Cloudflare (tick tiap menit): heartbeat ${ago(cfAge)} lalu${cf.ok ? "" : " (gagal)"}`, `Cloudflare (ticks every minute): heartbeat ${ago(cfAge)} ago${cf.ok ? "" : " (failed)"}`)}
              </Pill>
            ) : null}
            {gh && ghAge !== null ? (
              <a href={gh.url} target="_blank" rel="noreferrer">
                {/* Backup only: GitHub runs scheduled workflows irregularly (hours apart on a quiet repo). */}
                <Pill tone={gh.ok ? "ok" : "danger"}>
                  {t(`GitHub Actions (cadangan): run terakhir ${ago(ghAge)} lalu${gh.ok ? "" : " (gagal)"}`, `GitHub Actions (backup): last run ${ago(ghAge)} ago${gh.ok ? "" : " (failed)"}`)}
                </Pill>
              </a>
            ) : null}
            {hbAge !== null ? <Pill tone={s.heartbeat?.ok && hbAge < 120 ? "ok" : "danger"}>{t(`lokal: terakhir aktif ${ago(hbAge)} lalu`, `local: last active ${ago(hbAge)} ago`)}</Pill> : null}
            {!cf && !gh && hbAge === null ? <Pill>{t("belum ada heartbeat", "no heartbeat yet")}</Pill> : null}
          </li>
          <li>
            {t("Diselamatkan sejauh ini:", "Saved so far:")} <b>{fmt(s.saved)} rUSDC</b> · {t("sedang dibekukan:", "frozen now:")} {s.frozenNow} · {t("dalam sengketa:", "in dispute:")} {s.inDispute}
          </li>
        </ul>
      </Card>

      <Card title={t("Kunci akun umpan", "Bait account key")}>
        {s.publishedKey ? (
          <div className="space-y-2">
            <code className="mono block break-all rounded bg-stone-100 p-2 text-xs dark:bg-stone-950">{s.publishedKey}</code>
            <p className="text-xs text-stone-500">
              {lang === "en" ? (
                <>
                  Example: <span className="mono">near tokens / near-api-js</span> → call <span className="mono">transfer</span>, <span className="mono">unwrap</span>, or <span className="mono">send_usdc</span> on {s.contractId} (attach 0.005 NEAR for storage).
                </>
              ) : (
                <>
                  Contoh: <span className="mono">near tokens / near-api-js</span> → panggil <span className="mono">transfer</span>, <span className="mono">unwrap</span>, atau <span className="mono">send_usdc</span> di {s.contractId} (lampirkan 0,005 NEAR biaya storage).
                </>
              )}
            </p>
          </div>
        ) : (
          <p className="text-sm text-stone-500">{t("Kunci akan dipublikasikan saat tantangan dibuka (diumumkan oleh tim).", "The key will be published when the challenge opens (announced by the team).")}</p>
        )}
      </Card>

      <Card title={t("Percobaan terakhir", "Latest attempts")}>
        {s.recent.length === 0 ? (
          <p className="text-sm text-stone-500">{t("Belum ada yang mencoba.", "No one has tried yet.")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {s.recent.map((tx) => (
              <li key={tx.id} className="flex flex-wrap items-center gap-2">
                <span className="mono text-xs text-stone-500">#{tx.id}</span>
                <span className="tabular-nums">{fmt(tx.amount)}</span>
                <span className="text-stone-500">{tx.kind === "Exit" ? "USDC" : "rUSDC"} → {short(tx.to)}</span>
                <StatusBadge status={tx.status} />
                {tx.final_to && <span className="text-xs text-stone-500">{t("akhir:", "ended at:")} {short(tx.final_to)}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Notice kind="info">
        {lang === "en" ? (
          <>
            What this challenge proves: Panic + the undo window + the guard make stolen money impossible to cash out. What it does <b>not</b> prove: that the account cannot be broken into. The key is given away on purpose.
          </>
        ) : (
          <>
            Yang dibuktikan tantangan ini: Panik + jendela undo + penjaga membuat uang curian tidak bisa dicairkan. Yang <b>tidak</b> dibuktikan: bahwa akun tidak bisa dibobol. Kuncinya memang sengaja diberikan.
          </>
        )}
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
