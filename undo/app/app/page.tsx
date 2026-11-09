"use client";
import Link from "next/link";
import { Intro } from "@/components/intro/Intro";
import { btnClass } from "@/components/ui";
import { More, Strip } from "@/components/visual";
import { useT } from "@/lib/i18n";

export default function Home() {
  const t = useT();
  return (
    <div className="space-y-28 sm:space-y-36">
      <Intro />
      <HowItWorks />

      <section className="grid gap-12 md:grid-cols-2 md:gap-10">
        <Strip
          tone="rec"
          title={t("Kunci dicuri", "Key stolen")}
          panels={[
            { icon: "⚿", text: t("Pencuri mengirim 90% saldomu", "A thief sends 90% of your balance") },
            { icon: "❚❚", text: t("Dari HP, kamu tekan PANIK", "From your phone, you hit PANIC"), hot: true },
            { icon: "◀◀", text: t("Uang kembali. Tanpa voting.", "Money back. No vote.") },
          ]}
        />
        <Strip
          tone="plum"
          title={t("Ditipu penjual palsu", "Scammed by a fake seller")}
          panels={[
            { icon: "⚑", text: t("Laporkan selagi masih pending", "Report it while it's pending") },
            { icon: "⛨", text: t("Bukti dienkripsi untuk AI di TEE", "Evidence encrypted for an AI in a TEE") },
            { icon: "⚖", text: t("Dewan memutus: 2 dari 3", "The council decides: 2 of 3"), hot: true },
          ]}
        />
      </section>

      <section className="mx-auto max-w-3xl text-center">
        <h2 className="serif text-3xl leading-tight sm:text-4xl">
          <span className="text-signal">⚡</span> {t("Kontak tepercaya", "Trusted contacts")}
        </h2>
        <p className="mt-3 text-lg text-dim">
          {t("Bayar toko langganan langsung final. Kontak baru menunggu 5 menit, jadi pencuri tidak bisa menyelipkan dirinya.", "Pay your regular shop instantly. New contacts wait 5 minutes, so a thief can't sneak himself in.")}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/dompet" className={btnClass("primary")}>
            {t("Coba dompet demo", "Try the demo wallet")}
          </Link>
          <Link href="/coba-curi" className={btnClass("ghost")}>
            {t("Coba curi uang kami", "Try to steal from us")}
          </Link>
        </div>
        <div className="text-left">
          <More label={t("Prior art dan yang baru", "Prior art and what's new")}>
            <p>
              {t(
                "Prior art yang kami akui: ERC-20R (Stanford 2022), REVERSO, SLOW, Circle Refund Protocol, Payy Finality. Yang baru dari Undo: sengketa yang buktinya tetap rahasia bahkan dari operator, tapi prosedur dan putusannya terbukti di kontrak.",
                "Prior art we acknowledge: ERC-20R (Stanford 2022), REVERSO, SLOW, Circle Refund Protocol, Payy Finality. What is new in Undo: a dispute whose evidence stays secret even from the operator, while its procedure and verdict are proven in the contract.",
              )}
            </p>
          </More>
        </div>
      </section>
    </div>
  );
}

/** The whole idea as one tape: a transfer runs through a 5-minute window, and two things can stop it. */
function HowItWorks() {
  const t = useT();
  const stops = [
    { glyph: "▶", label: t("Kirim", "Send"), sub: t("uang keluar", "money leaves"), cls: "text-ink" },
    { glyph: "5:00", label: t("Jendela undo", "Undo window"), sub: t("masih bisa dibatalkan", "still reversible"), cls: "text-signal" },
    { glyph: "■", label: "Final", sub: t("seperti USDC biasa", "like plain USDC"), cls: "text-ink" },
  ];
  return (
    <section aria-labelledby="how">
      <h2 id="how" className="serif text-center text-4xl leading-tight sm:text-5xl">
        {t("Satu pita, lima menit.", "One tape, five minutes.")}
      </h2>
      <ol className="relative mx-auto mt-12 grid max-w-4xl gap-8 sm:grid-cols-3 sm:gap-6">
        {/* the tape behind the three stops; the stretch over the undo window glows amber */}
        <span aria-hidden className="absolute left-[16.6%] right-[16.6%] top-8 hidden h-1 rounded-full bg-[linear-gradient(90deg,#ffffff22_0%,var(--color-signal)_35%,var(--color-signal)_65%,#ffffff22_100%)] sm:block" />
        {stops.map((s) => (
          <li key={s.label} className="relative flex items-center gap-4 sm:flex-col sm:text-center">
            <span className={`timer grid h-16 w-16 shrink-0 place-items-center rounded-full bg-panel text-3xl leading-none shadow-[0_0_0_6px_var(--color-tape)] ${s.cls}`}>{s.glyph}</span>
            <span>
              <span className="block text-lg font-semibold">{s.label}</span>
              <span className="text-sm text-muted">{s.sub}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* two ways out of the window */}
      <div className="mx-auto mt-12 grid max-w-3xl gap-4 sm:grid-cols-2">
        <div className="rounded-[14px] bg-panel bg-[radial-gradient(120%_90%_at_0%_0%,#9fe8ff1f,transparent_60%)] p-5">
          <div className="timer text-2xl leading-none">
            <span className="text-ice">❚❚ {t("PANIK", "PANIC")}</span> <span className="text-muted">▶</span> <span className="text-sky">◀◀ {t("KEMBALI", "BACK")}</span>
          </div>
          <p className="mt-2 font-semibold text-ink">{t("Kunci dicuri? Uang kembali, tanpa voting.", "Key stolen? Money back, no vote.")}</p>
        </div>
        <div className="rounded-[14px] bg-panel bg-[radial-gradient(120%_90%_at_0%_0%,#c3a2ff1f,transparent_60%)] p-5">
          <div className="timer text-2xl leading-none text-plum">
            ⚑ {t("LAPOR", "REPORT")} <span className="text-muted">▶</span> ⚖ {t("SIDANG AI", "AI COURT")}
          </div>
          <p className="mt-2 font-semibold text-ink">{t("Ditipu? Sidang AI privat, lalu dewan memutus.", "Scammed? A private AI court, then the council decides.")}</p>
        </div>
      </div>
    </section>
  );
}
