"use client";
import { Card, Pill, usePoll } from "@/components/ui";
import { ADDR, LOCKED_EXAMPLE, UNDO, USDC, V1_CODE_HASH, V2_CODE_HASH } from "@/lib/config";
import { MODEL, PROMPT, sha256hex } from "@/lib/court";
import { useFmt, useLang, useT } from "@/lib/i18n";
import { provider, view } from "@/lib/near-client";
import type { Config } from "@/lib/types";

async function contractFacts(id: string) {
  const [acct, keys] = await Promise.all([provider.viewAccount({ accountId: id }), provider.viewAccessKeyList({ accountId: id })]);
  return { codeHash: (acct as { code_hash: string }).code_hash, keys: ((keys as { keys?: unknown[] }).keys ?? []).length };
}

export default function JanjiPage() {
  const t = useT();
  const lang = useLang();
  const fmt = useFmt();
  const [cfg] = usePoll(() => view<Config>(UNDO, "get_config"), [], 10000);
  const [dev] = usePoll(() => contractFacts(UNDO), [], 15000);
  const [locked] = usePoll(() => contractFacts(LOCKED_EXAMPLE), [], 30000);
  const [held] = usePoll(() => view<string>(USDC, "ft_balance_of", { account_id: UNDO }), [], 8000);
  const promptHash = sha256hex(PROMPT);
  const keysEn = (n: number) => `${n} ${n === 1 ? "key" : "keys"}`;

  return (
    <div className="space-y-4">
      <Card title={t("Janji yang dikunci kode", "Promises enforced by the code")}>
        <p className="text-sm text-stone-600 dark:text-stone-300">
          {t(
            "Undo adalah escrow. Orang hanya mau memakainya kalau tidak perlu percaya pada siapa pun, termasuk kami. Setiap janji di bawah ditegakkan kontrak, dan yang bisa dicek langsung dari chain dicek di halaman ini sekarang juga.",
            "Undo is an escrow. People will only use it if they do not have to trust anyone, including us. Every promise below is enforced by the contract, and the ones that can be checked directly on chain are checked on this page right now.",
          )}
        </p>
      </Card>

      <PromiseCard id="J1" title={t("Uang pending hanya bisa berakhir di dua tempat", "Pending money can end in only two places")} tests={t("j1_*, property_j1_j2_j6 (16.000 langkah acak)", "j1_*, property_j1_j2_j6 (16,000 random steps)")}>
        {lang === "en" ? (
          <>
            The receiver, or the sender&apos;s side (its recovery account, or the sender itself). The <code>resolve</code> and <code>finalize</code> functions do not take a destination address at all. The Circle Refund Protocol arbiter uses the same idea.
          </>
        ) : (
          <>
            Penerima, atau pihak pengirim (akun pemulihannya, atau dirinya sendiri). Fungsi <code>resolve</code> dan <code>finalize</code> tidak menerima alamat tujuan sama sekali. Ide yang sama dipakai arbiter Circle Refund Protocol.
          </>
        )}
      </PromiseCard>
      <PromiseCard id="J2" title={t("Hanya uang yang masih dalam jendela yang bisa disentuh", "Only money still inside its window can be touched")} tests="j2_*, property (J2)">
        {lang === "en" ? (
          <>Once the {cfg ? `${cfg.window_sec}-second ` : ""}window has passed, the money is final like ordinary USDC. Panic and fraud reports are rejected for transfers that have already matured.</>
        ) : (
          <>Setelah jendela {cfg ? `${cfg.window_sec} detik` : ""} lewat, uangnya final seperti USDC biasa. Panik dan laporan menolak transfer yang sudah matang.</>
        )}
      </PromiseCard>
      <PromiseCard id="J3" title={t("Tidak ada pembatalan tanpa aksi aktif; AI tidak memindahkan uang", "No reversal without an active step; the AI does not move money")} tests="j3_*, j7_an_honest_court_recommendation_is_stored_and_moves_no_money">
        {t(
          "Kalau dewan diam, keadaan yang dibantah tetap berlaku: laporan penipuan → uang ke penerima; bantahan atas Panik → Panik tetap berlaku.",
          "If the council does nothing, the challenged outcome stands: fraud report → the money goes to the receiver; contested Panic → the Panic stands.",
        )}
      </PromiseCard>
      <PromiseCard id="J4" title={t("Hanya pihak pengirim yang bisa melapor, dan laporan palsu ada harganya", "Only the sender's side can report, and a false report has a cost")} tests="j4_*">
        {lang === "en" ? (
          <>Bond {cfg ? `${Number(BigInt(cfg.bond) / 10n ** 18n) / 1e6} NEAR` : ""}; if you lose, the bond goes to the receiver and the loss is recorded on-chain.</>
        ) : (
          <>Bond {cfg ? `${Number(BigInt(cfg.bond) / 10n ** 18n) / 1e6} NEAR` : ""}; kalah → bond untuk penerima dan kekalahan tercatat on-chain.</>
        )}
      </PromiseCard>

      <PromiseCard id="J5" title={t("Kami tidak bisa mengubah aturan diam-diam", "We cannot change the rules quietly")} tests={t("S25 (penguncian)", "S25 (locking)")} live>
        <ul className="mt-2 space-y-1 text-sm">
          <li className="flex flex-wrap items-center gap-2">
            {t("Kontrak terkunci (salinan v1):", "Locked contract (v1 copy):")}{" "}
            <a className="mono text-xs underline" href={ADDR(LOCKED_EXAMPLE)} target="_blank" rel="noreferrer">
              {LOCKED_EXAMPLE}
            </a>
            {locked && <Pill tone={locked.keys === 0 ? "ok" : "danger"}>{lang === "en" ? `${locked.keys} access ${locked.keys === 1 ? "key" : "keys"}` : `${locked.keys} access key`}</Pill>}
            {locked && <Pill tone={locked.codeHash === V1_CODE_HASH ? "ok" : "danger"}>{t("hash kode", "code hash")} {locked.codeHash === V1_CODE_HASH ? "= build v1" : t("berbeda", "differs")}</Pill>}
          </li>
          <li className="flex flex-wrap items-center gap-2">
            {t("Kontrak demo ini:", "This demo contract:")} <span className="mono text-xs">{UNDO}</span>
            {dev && <Pill tone={dev.keys === 0 ? "ok" : "neutral"}>{dev.keys === 0 ? t("terkunci", "locked") : t(`${dev.keys} key (belum dikunci, kontrak demo)`, `${keysEn(dev.keys)} (not locked yet, demo contract)`)}</Pill>}
            {dev && <Pill tone={dev.codeHash === V2_CODE_HASH ? "ok" : "danger"}>{t("hash kode", "code hash")} {dev.codeHash === V2_CODE_HASH ? t("= build reproducible v2", "= reproducible v2 build") : t("berbeda", "differs")}</Pill>}
          </li>
          <li className="text-xs text-stone-500">
            {t("Hash build v2 (reproducible):", "v2 build hash (reproducible):")} <span className="mono">{V2_CODE_HASH}</span>.{" "}
            {t(
              "Buat ulang sendiri: di undo/contracts/undo-token jalankan cargo near build reproducible-wasm pada commit 65c1c0e (butuh Docker); hasilnya harus sama persis dengan hash kode kontrak di atas.",
              "Rebuild it yourself: in undo/contracts/undo-token run cargo near build reproducible-wasm at commit 65c1c0e (needs Docker); the result must equal the contract's code hash above.",
            )}{" "}
            {t("Hash v1 (tag contract-v1):", "v1 hash (tag contract-v1):")} <span className="mono">{V1_CODE_HASH}</span>.
          </li>
        </ul>
      </PromiseCard>

      <PromiseCard id="J6" title={t("1 rUSDC selalu bisa ditukar 1 USDC", "1 rUSDC can always be redeemed for 1 USDC")} tests="j6_*, property (J6)" live>
        {cfg && held !== undefined && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {t("Suplai rUSDC", "rUSDC supply")} <b className="tabular-nums">{fmt(cfg.total_supply)}</b> · {t("USDC dipegang kontrak", "USDC held by the contract")} <b className="tabular-nums">{fmt(held)}</b>
            <Pill tone={cfg.total_supply === held ? "ok" : "danger"}>{cfg.total_supply === held ? t("cocok", "match") : t("TIDAK cocok", "does NOT match")}</Pill>
          </div>
        )}
      </PromiseCard>

      <PromiseCard id="J7" title={t("Server sidang tidak perlu dipercaya", "The court server needs no trust")} tests={t("j7_*, S26 (model NEAR AI asli)", "j7_*, S26 (real NEAR AI model)")} live>
        {cfg && (
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {t("Model yang di-pin dewan:", "Model pinned by the council:")} <span className="mono text-xs">{cfg.court.model_id}</span>
              <Pill tone={cfg.court.model_id === MODEL ? "ok" : "danger"}>{cfg.court.model_id === MODEL ? t("sesuai prosedur", "matches the procedure") : t("beda", "differs")}</Pill>
              <span className="mono text-xs text-stone-500">{t("kunci", "key")} {cfg.court.signer?.slice(0, 16)}…</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {t("Hash prompt resmi on-chain vs dihitung browser ini:", "Official prompt hash on-chain vs computed by this browser:")}
              <Pill tone={cfg.court.prompt_sha256 === promptHash ? "ok" : "danger"}>{cfg.court.prompt_sha256 === promptHash ? t("cocok", "match") : t("beda", "differs")}</Pill>
            </div>
            <details className="text-xs text-stone-500">
              <summary className="cursor-pointer">{t("Lihat prompt resmi", "View the official prompt")}</summary>
              <p className="mt-1">
                {t(
                  "Prompt v2 (bahasa Inggris; model menulis alasan publik dalam dua bahasa). Kontrak memeriksa sha256 teks ini, jadi yang tampil di sini persis yang dibaca model. Kunci JSON dan nilai putusan tetap bahasa Indonesia karena dibaca kontrak.",
                  "Prompt v2 (English; the model writes the public reason in both languages). The contract checks the sha256 of this exact text, so what you see is what the model reads. The JSON keys and verdict values stay Indonesian because the contract reads them.",
                )}
              </p>
              <pre className="mt-1 whitespace-pre-wrap rounded bg-stone-50 p-2 dark:bg-stone-950">{PROMPT}</pre>
            </details>
          </div>
        )}
      </PromiseCard>

      {cfg?.contact_delay_sec !== undefined && (
        <PromiseCard id="T0" title={t("Kontak tepercaya: cepat, tapi tidak bisa diserobot pencuri", "Trusted contacts: fast, but a thief cannot just add himself")} tests="t0_*, property (add_contact, cancel_contact)" live>
          <p>
            {t(
              `Pembayaran ke kontak yang sudah aktif langsung final, tanpa jendela, jadi tidak bisa dibatalkan (J2 tetap berlaku karena memang tidak ada jendela). Kontak baru baru aktif setelah ${Math.round(cfg.contact_delay_sec / 60)} menit (jendela transfer: ${Math.round(cfg.window_sec / 60)} menit). Kontrak menolak jeda yang lebih pendek dari jendela saat deploy. Panik membatalkan semua kontak yang belum aktif, dan akun pemulihan bisa menghapus kontak mana pun tanpa Panik.`,
              `A payment to an active contact is final at once, with no window, so it cannot be undone (J2 still holds: there is no window). A new contact becomes active only after ${Math.round(cfg.contact_delay_sec / 60)} min (transfer window: ${Math.round(cfg.window_sec / 60)} min). The contract refuses a delay shorter than the window at deployment. Panic cancels every contact that is not active yet, and the recovery account can remove any contact without a panic.`,
            )}
          </p>
          <p className="mt-1">
            {t("Jeda kontak on-chain:", "Contact delay on chain:")} <b>{cfg.contact_delay_sec} {t("dtk", "s")}</b> ·{" "}
            <Pill tone={cfg.contact_delay_sec >= cfg.window_sec ? "ok" : "danger"}>
              {cfg.contact_delay_sec >= cfg.window_sec ? t("≥ jendela", "≥ window") : t("lebih pendek dari jendela", "shorter than the window")}
            </Pill>
          </p>
        </PromiseCard>
      )}
    </div>
  );
}

function PromiseCard({ id, title, tests, live, children }: { id: string; title: string; tests: string; live?: boolean; children: React.ReactNode }) {
  const t = useT();
  return (
    <Card
      title={
        <span className="flex items-center gap-2 normal-case">
          <span className="mono rounded bg-emerald-700 px-1.5 py-0.5 text-xs text-white">{id}</span>
          <span className="text-stone-900 dark:text-stone-100">{title}</span>
        </span>
      }
      right={live ? <Pill tone="ok">{t("dicek langsung", "checked live")}</Pill> : null}
    >
      <div className="text-sm text-stone-600 dark:text-stone-300">{children}</div>
      <p className="mt-2 text-xs text-stone-500">{t("Tes:", "Tests:")} {tests}</p>
    </Card>
  );
}
