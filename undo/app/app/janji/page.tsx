"use client";
import { Card, Pill, usePoll } from "@/components/ui";
import { ADDR, LOCKED_EXAMPLE, PUBLISHED_CODE_HASH, UNDO, USDC } from "@/lib/config";
import { MODEL, PROMPT, sha256hex } from "@/lib/court";
import { fmt, provider, view } from "@/lib/near-client";
import type { Config } from "@/lib/types";

async function contractFacts(id: string) {
  const [acct, keys] = await Promise.all([provider.viewAccount({ accountId: id }), provider.viewAccessKeyList({ accountId: id })]);
  return { codeHash: (acct as { code_hash: string }).code_hash, keys: ((keys as { keys?: unknown[] }).keys ?? []).length };
}

export default function JanjiPage() {
  const [cfg] = usePoll(() => view<Config>(UNDO, "get_config"), [], 10000);
  const [dev] = usePoll(() => contractFacts(UNDO), [], 15000);
  const [locked] = usePoll(() => contractFacts(LOCKED_EXAMPLE), [], 30000);
  const [held] = usePoll(() => view<string>(USDC, "ft_balance_of", { account_id: UNDO }), [], 8000);
  const promptHash = sha256hex(PROMPT);

  return (
    <div className="space-y-4">
      <Card title="Janji yang dikunci kode">
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Undo adalah escrow. Orang hanya mau memakainya kalau tidak perlu percaya pada siapa pun, termasuk kami. Setiap janji di bawah ditegakkan kontrak, dan yang bisa dicek langsung dari chain dicek di halaman ini sekarang juga.
        </p>
      </Card>

      <PromiseCard id="J1" title="Uang pending hanya bisa berakhir di dua tempat" tests="j1_*, property_j1_j2_j6 (16.000 langkah acak)">
        Penerima, atau pihak pengirim (akun pemulihannya, atau dirinya sendiri). Fungsi <code>resolve</code> dan <code>finalize</code> tidak menerima alamat tujuan sama sekali. Ide yang sama dipakai arbiter Circle Refund Protocol.
      </PromiseCard>
      <PromiseCard id="J2" title="Hanya uang yang masih dalam jendela yang bisa disentuh" tests="j2_*, property (J2)">
        Setelah jendela {cfg ? `${cfg.window_sec} detik` : ""} lewat, uangnya final seperti USDC biasa. Panik dan laporan menolak transfer yang sudah matang.
      </PromiseCard>
      <PromiseCard id="J3" title="Tidak ada pembatalan tanpa aksi aktif; AI tidak memindahkan uang" tests="j3_*, j7_an_honest_court_recommendation_is_stored_and_moves_no_money">
        Kalau dewan diam, keadaan yang dibantah tetap berlaku: laporan penipuan → uang ke penerima; bantahan atas Panik → Panik tetap berlaku.
      </PromiseCard>
      <PromiseCard id="J4" title="Hanya pihak pengirim yang bisa melapor, dan laporan palsu ada harganya" tests="j4_*">
        Bond {cfg ? `${Number(BigInt(cfg.bond) / 10n ** 18n) / 1e6} NEAR` : ""}; kalah → bond untuk penerima dan kekalahan tercatat on-chain.
      </PromiseCard>

      <PromiseCard id="J5" title="Kami tidak bisa mengubah aturan diam-diam" tests="S25 (penguncian)" live>
        <ul className="mt-2 space-y-1 text-sm">
          <li className="flex flex-wrap items-center gap-2">
            Kontrak terkunci (salinan v1):{" "}
            <a className="mono text-xs underline" href={ADDR(LOCKED_EXAMPLE)} target="_blank" rel="noreferrer">
              {LOCKED_EXAMPLE}
            </a>
            {locked && <Pill tone={locked.keys === 0 ? "ok" : "danger"}>{locked.keys} access key</Pill>}
            {locked && <Pill tone={locked.codeHash === PUBLISHED_CODE_HASH ? "ok" : "danger"}>hash kode {locked.codeHash === PUBLISHED_CODE_HASH ? "= build v1" : "berbeda"}</Pill>}
          </li>
          <li className="flex flex-wrap items-center gap-2">
            Kontrak demo ini: <span className="mono text-xs">{UNDO}</span>
            {dev && <Pill tone={dev.keys === 0 ? "ok" : "neutral"}>{dev.keys === 0 ? "terkunci" : `${dev.keys} key (belum dikunci, kontrak demo)`}</Pill>}
            {dev && <Pill tone={dev.codeHash === PUBLISHED_CODE_HASH ? "ok" : "danger"}>hash kode {dev.codeHash === PUBLISHED_CODE_HASH ? "= build v1" : "berbeda"}</Pill>}
          </li>
          <li className="text-xs text-stone-500">
            Hash build v1 yang dipublikasikan: <span className="mono">{PUBLISHED_CODE_HASH}</span>. Build reproducible dari repo publik menyusul.
          </li>
        </ul>
      </PromiseCard>

      <PromiseCard id="J6" title="1 rUSDC selalu bisa ditukar 1 USDC" tests="j6_*, property (J6)" live>
        {cfg && held !== undefined && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            Suplai rUSDC <b className="tabular-nums">{fmt(cfg.total_supply)}</b> · USDC dipegang kontrak <b className="tabular-nums">{fmt(held)}</b>
            <Pill tone={cfg.total_supply === held ? "ok" : "danger"}>{cfg.total_supply === held ? "cocok" : "TIDAK cocok"}</Pill>
          </div>
        )}
      </PromiseCard>

      <PromiseCard id="J7" title="Server sidang tidak perlu dipercaya" tests="j7_*, S26 (model NEAR AI asli)" live>
        {cfg && (
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              Model yang di-pin dewan: <span className="mono text-xs">{cfg.court.model_id}</span>
              <Pill tone={cfg.court.model_id === MODEL ? "ok" : "danger"}>{cfg.court.model_id === MODEL ? "sesuai prosedur" : "beda"}</Pill>
              <span className="mono text-xs text-stone-500">kunci {cfg.court.signer?.slice(0, 16)}…</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              Hash prompt resmi on-chain vs dihitung browser ini:
              <Pill tone={cfg.court.prompt_sha256 === promptHash ? "ok" : "danger"}>{cfg.court.prompt_sha256 === promptHash ? "cocok" : "beda"}</Pill>
            </div>
            <details className="text-xs text-stone-500">
              <summary className="cursor-pointer">Lihat prompt resmi</summary>
              <pre className="mt-1 whitespace-pre-wrap rounded bg-stone-50 p-2 dark:bg-stone-950">{PROMPT}</pre>
            </details>
          </div>
        )}
      </PromiseCard>
    </div>
  );
}

function PromiseCard({ id, title, tests, live, children }: { id: string; title: string; tests: string; live?: boolean; children: React.ReactNode }) {
  return (
    <Card
      title={
        <span className="flex items-center gap-2 normal-case">
          <span className="mono rounded bg-emerald-700 px-1.5 py-0.5 text-xs text-white">{id}</span>
          <span className="text-stone-900 dark:text-stone-100">{title}</span>
        </span>
      }
      right={live ? <Pill tone="ok">dicek langsung</Pill> : null}
    >
      <div className="text-sm text-stone-600 dark:text-stone-300">{children}</div>
      <p className="mt-2 text-xs text-stone-500">Tes: {tests}</p>
    </Card>
  );
}
