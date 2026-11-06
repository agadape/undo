"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Reels, btnClass } from "@/components/ui";
import { useLang, useT } from "@/lib/i18n";

export default function Home() {
  const t = useT();
  const lang = useLang();
  return (
    <div className="space-y-8">
      <section className="grid items-center gap-8 pt-2 md:grid-cols-[1.25fr_1fr]">
        <div className="space-y-4">
          <p className="osd text-xl leading-none text-signal">
            NEAR testnet · <span className="normal-case">rUSDC</span> 1:1
          </p>
          <h1 className="osd rgb text-6xl leading-[0.9] sm:text-7xl lg:text-8xl">
            <span className="text-phosphor">Ctrl+Z</span> {t("untuk USDC.", "for USDC.")}
          </h1>
          <p className="max-w-2xl text-dim">
            {lang === "en" ? (
              <>
                Undo is wrapped USDC (rUSDC, 1:1). Every transfer stays pending for an undo window first. If your key is stolen, your recovery account presses <b className="text-ink">Panic</b> and the money comes back with no vote. If you are scammed, your evidence is read by an AI inside a TEE — encrypted even from us — and the contract checks that the procedure was followed before the council decides.
              </>
            ) : (
              <>
                Undo adalah USDC yang dibungkus (rUSDC, 1:1). Setiap transfer pending dulu selama jendela undo. Kalau kuncimu dicuri, akun pemulihanmu menekan <b className="text-ink">Panik</b> dan uangnya kembali tanpa voting. Kalau kamu ditipu, buktimu dibaca AI di dalam TEE — terenkripsi bahkan dari kami — dan kontrak membuktikan prosedurnya sebelum dewan memutus.
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href="/dompet" className={btnClass("primary")}>
              {t("Coba dompet demo", "Try the demo wallet")}
            </Link>
            <Link href="/janji" className={btnClass("ghost")}>
              {t("Lihat janji yang dikunci kode", "See the promises enforced by the code")}
            </Link>
          </div>
        </div>
        <TapeScreen />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Concept icon="▶ 5:00" tone="text-signal border-signal/50" title={t("Jendela undo", "Undo window")}>
          {t("Setiap transfer pending dulu. Selama jamnya masih berjalan, transfer itu masih bisa diputar balik.", "Every transfer waits first. While its clock is still running, the transfer can still be rewound.")}
        </Concept>
        <Concept icon={t("❚❚ PANIK", "❚❚ PANIC")} tone="text-ice border-ice/50" title={t("Waktu berhenti", "Time stops")}>
          {t("Akun pemulihan menekan Panik: transfer dibekukan dan akun dikunci.", "The recovery account presses Panic: the transfer is frozen and the account is locked.")}
        </Concept>
        <Concept icon={t("◀◀ FINALISASI", "◀◀ FINALIZE")} tone="text-phosphor border-phosphor/50" title={t("Waktu mundur", "Time rewinds")}>
          {t("Kalau tidak dibantah, uangnya kembali ke akun pemulihan. Tanpa voting.", "If nobody contests, the money goes back to the recovery account. No vote.")}
        </Concept>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Flow
          title={t("Kunci dicuri", "Key stolen")}
          steps={[
            t("Pencuri mengirim 90% saldomu. Di sisi pencuri uangnya hanya pending.", "A thief sends 90% of your balance. On the thief's side the money is only pending."),
            t("Dari akun pemulihan, kamu tekan PANIK: transfer dibekukan, akun dikunci.", "From the recovery account you press PANIC: the transfer is frozen and the account is locked."),
            t("Tidak dibantah → siapa saja menekan Finalisasi, uang ke akun pemulihan. Tanpa voting.", "Not contested → anyone presses Finalize and the money goes to the recovery account. No vote."),
          ]}
        />
        <Flow
          title={t("Ditipu penjual palsu", "Scammed by a fake seller")}
          steps={[
            t("Laporkan selama uang masih pending (bond kecil).", "Report while the money is still pending (small bond)."),
            t("Kedua pihak mengirim bukti, dienkripsi di browser ke model NEAR AI di TEE.", "Both sides submit evidence, encrypted in the browser for the NEAR AI model in the TEE."),
            t("Kontrak memverifikasi tanda tangan TEE, prompt resmi, dan kelengkapan bukti; dewan DAO memutus.", "The contract verifies the TEE signature, the official prompt and that the evidence is complete; the DAO council decides."),
          ]}
        />
      </section>

      <section className="rounded-[3px] border border-line bg-panel p-5">
        <h2 className="osd rgb mb-2 text-2xl leading-none">
          <span aria-hidden className="text-phosphor">
            ▌
          </span>
          {t("Toko langganan? Kontak tepercaya", "A regular shop? Trusted contacts")}
        </h2>
        <p className="text-sm text-dim">
          {t(
            "Pembayaran ke kontak yang sudah aktif langsung final, jadi toko tidak perlu menunggu jendela. Kontak baru baru aktif setelah jeda (5 menit di demo), notifikasi muncul, dan Panik atau akun pemulihan bisa membatalkannya, jadi pencuri tidak bisa sekadar menambahkan dirinya.",
            "Payments to an active contact are final at once, so a shop does not wait for the window. A new contact only becomes active after a delay (5 min on the demo), an alert shows up, and panic or the recovery account can cancel it, so a thief cannot just add himself.",
          )}
        </p>
      </section>

      <section className="rounded-[2px] border-l-4 border-signal bg-signal/10 p-4 text-sm text-dim">
        {t(
          "Prior art yang kami akui: ERC-20R (Stanford 2022), REVERSO, SLOW, Circle Refund Protocol, Payy Finality. Yang baru dari Undo: sengketa yang buktinya tetap rahasia bahkan dari operator, tapi prosedur dan putusannya terbukti di kontrak.",
          "Prior art we acknowledge: ERC-20R (Stanford 2022), REVERSO, SLOW, Circle Refund Protocol, Payy Finality. What is new in Undo: a dispute whose evidence stays secret even from the operator, while its procedure and verdict are proven in the contract.",
        )}
      </section>
    </div>
  );
}

function Concept({ icon, tone, title, children }: { icon: string; tone: string; title: string; children: ReactNode }) {
  return (
    <div className={`rounded-[3px] border bg-panel p-4 ${tone}`}>
      <div className="osd rgb text-2xl leading-none">{icon}</div>
      <h2 className="mt-2 font-bold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-dim">{children}</p>
    </div>
  );
}

function Flow({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="rounded-[3px] border border-line bg-panel p-5">
      <h2 className="osd rgb mb-3 text-2xl leading-none">
        <span aria-hidden className="text-phosphor">
          ▌
        </span>
        {title}
      </h2>
      <ol className="space-y-2 text-sm text-dim">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span aria-hidden className="osd w-6 shrink-0 text-xl leading-5 text-phosphor">
              0{i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Decorative blue screen: the counter runs down for a few seconds, then rewinds to 5:00 (the idea of Undo). */
function TapeScreen() {
  const t = useT();
  const [left, setLeft] = useState(300);
  const [rew, setRew] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let n = 300;
    let rewinding = false;
    const id = setInterval(() => {
      if (rewinding) {
        n = Math.min(300, n + 3);
        if (n === 300) rewinding = false;
      } else {
        n -= 1;
        if (n <= 288) rewinding = true;
      }
      setLeft(n);
      setRew(rewinding);
    }, 250);
    return () => clearInterval(id);
  }, []);
  // Ticks every 250 ms; show one "second" per tick so the demo loop stays short.
  const m = Math.floor(left / 60);
  const s = String(left % 60).padStart(2, "0");
  return (
    <div aria-hidden className="relative mx-auto aspect-[4/3] w-full max-w-sm overflow-hidden rounded-[22px] border-[10px] border-[#1a1b2e] bg-vhs p-4 shadow-[inset_0_0_40px_#000a]">
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,#0000_0_2px,#0003_2px_4px)]" />
      <div className="osd relative flex h-full flex-col text-white">
        <div className="flex justify-between text-2xl leading-none">
          <span>{rew ? "◀◀ REW" : "▶ PLAY"}</span>
          <span className="tabular-nums">00:0{m}:{s}</span>
        </div>
        <div className="rgb my-auto text-7xl leading-none">CTRL+Z</div>
        <div className="text-xl leading-none">
          {t("JENDELA UNDO", "UNDO WINDOW")} · <span className="normal-case">rUSDC</span>
        </div>
        <div className="mt-3">
          <Reels state={rew ? "rew" : "play"} size="2.75rem" />
        </div>
      </div>
    </div>
  );
}
