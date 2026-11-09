"use client";
import Link from "next/link";
import { Card, Notice, Pill, StatusBadge, btnClass, usePoll } from "@/components/ui";
import { More, NextStep, Strip } from "@/components/visual";
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
  if (!s) return <p className="text-sm text-muted">{t("memuat tantangan…", "loading the challenge…")}</p>;
  if (s.error) return <Notice kind="error">{s.error}</Notice>;
  const avgReact = s.reactionSec.length ? Math.round(s.reactionSec.reduce((a, b) => a + b, 0) / s.reactionSec.length) : null;
  const hbAge = s.heartbeat ? Math.round((Date.now() - Date.parse(s.heartbeat.at)) / 1000) : null;
  const ghAge = gh ? Math.round((Date.now() - Date.parse(gh.at)) / 1000) : null;
  const cfAge = cf ? Math.round((Date.now() - Date.parse(cf.at)) / 1000) : null;
  const target = BigInt(s.balance.available) + BigInt(s.balance.pending_in) + BigInt(s.balance.frozen_in);

  return (
    <div className="space-y-12 [overflow-wrap:anywhere] sm:space-y-16">
      <section className="space-y-4 pt-2">
        <h1 className="serif text-4xl leading-tight sm:text-5xl">{t("Coba Curi", "Coba Curi (try to steal)")}</h1>
        <p className="text-lg font-medium text-dim sm:text-xl">
          {t("Kuncinya bisa dicuri.", "The key can be stolen.")} <span className="text-sky">{t("Uangnya tidak bisa dicairkan.", "The money can't be cashed out.")}</span>{" "}
          <span aria-hidden className="inline-flex items-center gap-1.5 text-sm font-semibold text-rec">
            <span className="blink">●</span> LIVE · testnet
          </span>
        </p>
      </section>

      <Strip
        tone="rec"
        title={t("Aturan mainnya", "The game")}
        panels={[
          { icon: "🔑", text: s.publishedKey ? t("Kunci privatnya publik", "The private key is public") : t("Kunci diumumkan saat tantangan dibuka", "The key goes public when the challenge opens") },
          { icon: "⏱", text: t(`Setiap transfer keluar menunggu ${Math.round(s.windowSec / 60)} menit`, `Every transfer out waits ${Math.round(s.windowSec / 60)} min`) },
          { icon: "🚨", text: t("Penjaga menekan PANIK → uang kembali", "The guard hits PANIC → money comes back"), hot: true },
        ]}
      />
      <More>
        <p>
          {lang === "en" ? (
            <>
              Anyone holding the key may send, unwrap, or change the account&apos;s recovery account. The guard is the account&apos;s recovery account; after {Math.round(s.contestSec / 60)} min with no contest the frozen money comes back.
            </>
          ) : (
            <>
              Siapa pun yang memegang kuncinya boleh mengirim, unwrap, atau mengganti akun pemulihannya. Penjaga adalah akun pemulihannya; setelah {Math.round(s.contestSec / 60)} menit tanpa bantahan, uang yang dibekukan kembali.
            </>
          )}
        </p>
      </More>

      {/* What a visitor can do here, right under the rules. */}
      {s.publishedKey ? (
        <NextStep
          icon="🔑"
          tone="rec"
          label={t("Giliranmu", "Your move")}
          title={t("Ambil kuncinya di bawah dan coba cairkan uangnya", "Take the key below and try to cash out")}
          sub={t("Lalu lihat Percobaan terakhir: penjaga menekan PANIK dan uangnya kembali.", "Then watch Latest attempts: the guard hits PANIC and the money comes back.")}
          action={
            <>
              <a href="#bait-key" className={btnClass("primary", true)}>
                {t("Ambil kunci ↓", "Get the key ↓")}
              </a>
              <Link href="/dompet" className={btnClass("ghost", true)}>
                {t("Coba di dompet sendiri", "Try it in your own wallet")}
              </Link>
            </>
          }
        />
      ) : (
        <NextStep
          icon="⏳"
          tone="signal"
          title={t("Kuncinya belum dipublikasikan", "The key isn't public yet")}
          sub={t("Sementara itu, coba latihan yang sama di dompet demomu sendiri.", "Meanwhile, try the same drill in your own demo wallet.")}
          action={
            <Link href="/dompet" className={btnClass("primary", true)}>
              {t("Buka Dompet", "Open Wallet")}
            </Link>
          }
        />
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label={t("Saldo umpan", "Bait balance")} value={fmt(target)} unit="rUSDC" />
        <Tile label={t("Percobaan", "Attempts")} value={String(s.attempts)} />
        <Tile label={t("Berhasil dicairkan", "Cashed out")} value={fmt(s.escaped)} unit="rUSDC" tone={s.escaped === "0" ? "ok" : "danger"} />
        <Tile label={t("Reaksi penjaga (rata-rata)", "Guard reaction (average)")} value={avgReact === null ? "—" : t(`${avgReact} dtk`, `${avgReact} s`)} />
      </div>

      <Card title="Status">
        <ul className="space-y-4 text-sm">
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

      <div id="bait-key" className="scroll-mt-28">
      <Card title={t("Kunci akun umpan", "Bait account key")}>
        {s.publishedKey ? (
          <div className="space-y-4">
            <code className="mono block break-all rounded-[12px] bg-well p-4 text-xs text-sky">{s.publishedKey}</code>
            <p className="text-xs text-muted">
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
          <p className="text-sm text-muted">{t("Kunci akan dipublikasikan saat tantangan dibuka (diumumkan oleh tim).", "The key will be published when the challenge opens (announced by the team).")}</p>
        )}
      </Card>
      </div>

      <Card title={t("Percobaan terakhir", "Latest attempts")}>
        {s.recent.length === 0 ? (
          <p className="text-sm text-muted">{t("Belum ada yang mencoba.", "No one has tried yet.")}</p>
        ) : (
          <ul className="space-y-4 text-sm">
            {s.recent.map((tx) => (
              <li key={tx.id} className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">#{tx.id}</span>
                <span className="text-sm font-semibold tabular-nums text-ink">{fmt(tx.amount)}</span>
                <span className="text-muted">{tx.kind === "Exit" ? "USDC" : "rUSDC"} → {short(tx.to)}</span>
                <StatusBadge status={tx.status} />
                {tx.final_to && <span className="text-xs text-muted">{t("akhir:", "ended at:")} {short(tx.final_to)}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 text-sm sm:grid-cols-2">
        <p className="rounded-[14px] bg-sky/10 p-5">
          <b className="text-sky">✓ {t("Membuktikan:", "Proves:")}</b> {t("uang curian tidak bisa dicairkan.", "stolen money can't be cashed out.")}
        </p>
        <p className="rounded-[14px] bg-panel p-5 text-dim">
          <b className="text-ink">✗ {t("Tidak membuktikan:", "Doesn't prove:")}</b> {t("akunnya tidak bisa dibobol — kuncinya memang sengaja dibagikan.", "the account can't be broken into — the key is given away on purpose.")}
        </p>
      </div>
    </div>
  );
}

function Tile({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: "ok" | "danger" }) {
  const c = tone === "ok" ? "text-sky" : tone === "danger" ? "text-rec" : "text-ink";
  return (
    <div className="min-w-0 rounded-[14px] bg-panel p-5">
      <div className="text-sm font-semibold text-muted">{label}</div>
      <div className={`serif mt-3 break-words text-4xl leading-tight tabular-nums ${c}`}>
        {value}
        {/* The token name keeps its lowercase r (OSD text is otherwise all caps). */}
        {unit && <span className="ml-1.5 inline-block font-sans text-sm font-semibold normal-case text-muted">{unit}</span>}
      </div>
    </div>
  );
}
