"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Reels, btnClass } from "@/components/ui";
import { More, Strip } from "@/components/visual";
import { useT } from "@/lib/i18n";

export default function Home() {
  const t = useT();
  return (
    <div className="space-y-10">
      <section className="grid items-center gap-8 pt-2 md:grid-cols-[1.25fr_1fr]">
        <div className="space-y-5">
          <p className="osd text-xl leading-none text-signal">
            NEAR testnet · <span className="normal-case">rUSDC</span> 1:1
          </p>
          <h1 className="osd rgb text-6xl leading-[0.9] sm:text-7xl lg:text-8xl">
            <span className="text-phosphor">Ctrl+Z</span> {t("untuk USDC.", "for USDC.")}
          </h1>
          <p className="max-w-xl text-lg font-semibold leading-snug text-ink sm:text-xl">
            {t("Setiap transfer menunggu 5 menit dulu.", "Every transfer waits 5 minutes.")}{" "}
            <span className="text-rec">{t("Dicuri? Tekan PANIK.", "Stolen? Hit PANIC.")}</span>{" "}
            <span className="text-phosphor">{t("Uangnya kembali.", "The money comes back.")}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/dompet" className={btnClass("primary")}>
              ▶ {t("Coba dompet demo", "Try the demo wallet")}
            </Link>
            <Link href="/janji" className={btnClass("ghost")}>
              {t("Lihat janjinya", "See the promises")}
            </Link>
          </div>
        </div>
        <TapeScreen />
      </section>

      <HowItWorks />

      <section className="grid gap-4 md:grid-cols-2">
        <Strip
          tone="rec"
          title={t("Kunci dicuri", "Key stolen")}
          panels={[
            { icon: "🔑", text: t("Pencuri mengirim 90% saldomu", "A thief sends 90% of your balance") },
            { icon: "🚨", text: t("Dari HP, kamu tekan PANIK", "From your phone, you hit PANIC"), hot: true },
            { icon: "◀◀", text: t("Uang kembali. Tanpa voting.", "Money back. No vote.") },
          ]}
        />
        <Strip
          tone="plum"
          title={t("Ditipu penjual palsu", "Scammed by a fake seller")}
          panels={[
            { icon: "🚩", text: t("Laporkan selagi masih pending", "Report it while it's pending") },
            { icon: "🔒", text: t("Bukti dienkripsi untuk AI di TEE", "Evidence encrypted for an AI in a TEE") },
            { icon: "⚖️", text: t("Dewan memutus: 2 dari 3", "The council decides: 2 of 3"), hot: true },
          ]}
        />
      </section>

      <section className="flex items-start gap-4 rounded-[3px] border border-signal/40 bg-panel p-4 sm:items-center sm:p-5">
        <span aria-hidden className="text-4xl leading-none">
          ⚡
        </span>
        <div>
          <h2 className="osd rgb text-2xl leading-none text-signal">{t("Kontak tepercaya", "Trusted contacts")}</h2>
          <p className="mt-1 text-sm text-dim">
            {t("Bayar toko langganan langsung final. Kontak baru menunggu 5 menit, jadi pencuri tidak bisa menyelipkan dirinya.", "Pay your regular shop instantly. New contacts wait 5 minutes, so a thief can't sneak himself in.")}
          </p>
        </div>
      </section>

      <More label={t("Prior art dan yang baru", "Prior art and what's new")}>
        <p>
          {t(
            "Prior art yang kami akui: ERC-20R (Stanford 2022), REVERSO, SLOW, Circle Refund Protocol, Payy Finality. Yang baru dari Undo: sengketa yang buktinya tetap rahasia bahkan dari operator, tapi prosedur dan putusannya terbukti di kontrak.",
            "Prior art we acknowledge: ERC-20R (Stanford 2022), REVERSO, SLOW, Circle Refund Protocol, Payy Finality. What is new in Undo: a dispute whose evidence stays secret even from the operator, while its procedure and verdict are proven in the contract.",
          )}
        </p>
      </More>
    </div>
  );
}

/** The whole idea as one picture: a transfer runs through a 5-minute window, and two things can stop it. */
function HowItWorks() {
  const t = useT();
  const stations = [
    { icon: "▶", label: t("Kirim", "Send"), sub: t("uang keluar", "money leaves"), cls: "border-line-2 text-ink" },
    { icon: "5:00", label: t("Jendela undo", "Undo window"), sub: t("masih bisa dibatalkan", "still reversible"), cls: "border-signal text-signal" },
    { icon: "■", label: "Final", sub: t("seperti USDC biasa", "like plain USDC"), cls: "border-phosphor/60 text-phosphor" },
  ];
  return (
    <section aria-labelledby="how" className="rounded-[3px] border border-line bg-panel p-4 sm:p-6">
      <h2 id="how" className="osd rgb mb-5 text-2xl leading-none">
        <span aria-hidden className="text-phosphor">
          ▌
        </span>
        {t("Cara kerjanya", "How it works")}
      </h2>

      {/* the tape: three stations on one line */}
      <ol className="relative grid gap-3 sm:grid-cols-3 sm:gap-6">
        <span aria-hidden className="absolute left-[16%] right-[16%] top-9 hidden h-0.5 bg-[repeating-linear-gradient(90deg,var(--color-line-2)_0_10px,transparent_10px_16px)] sm:block" />
        {stations.map((s) => (
          <li key={s.label} className="relative flex items-center gap-3 sm:flex-col sm:text-center">
            <span className={`osd rgb grid h-[4.5rem] w-[4.5rem] shrink-0 place-items-center rounded-full border-2 bg-well text-3xl leading-none ${s.cls}`}>{s.icon}</span>
            <span>
              <span className="osd block text-2xl leading-none">{s.label}</span>
              <span className="text-sm text-muted">{s.sub}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* two ways out of the window */}
      <div className="mt-5 grid gap-3 sm:mx-auto sm:max-w-2xl sm:grid-cols-2">
        <div className="rounded-[2px] border border-rec/60 bg-rec/10 p-3">
          <div className="osd rgb text-2xl leading-none">
            <span className="text-ice">❚❚ {t("PANIK", "PANIC")}</span> <span className="text-muted">▶</span> <span className="text-phosphor">◀◀ {t("KEMBALI", "BACK")}</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-ink">{t("Kunci dicuri? Uang kembali, tanpa voting.", "Key stolen? Money back, no vote.")}</p>
        </div>
        <div className="rounded-[2px] border border-plum/60 bg-plum/10 p-3">
          <div className="osd rgb text-2xl leading-none text-plum">
            🚩 {t("LAPOR", "REPORT")} <span className="text-muted">▶</span> ⚖️ {t("SIDANG AI", "AI COURT")}
          </div>
          <p className="mt-1 text-sm font-semibold text-ink">{t("Ditipu? Sidang AI privat, lalu dewan memutus.", "Scammed? A private AI court, then the council decides.")}</p>
        </div>
      </div>
    </section>
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
