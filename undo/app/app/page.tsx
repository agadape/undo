"use client";
import Link from "next/link";
import { useLang, useT } from "@/lib/i18n";

export default function Home() {
  const t = useT();
  const lang = useLang();
  return (
    <div className="space-y-8">
      <section className="space-y-3 pt-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("Ctrl+Z untuk USDC.", "Ctrl+Z for USDC.")}</h1>
        <p className="max-w-2xl text-stone-600 dark:text-stone-300">
          {lang === "en" ? (
            <>
              Undo is wrapped USDC (rUSDC, 1:1). Every transfer stays pending for an undo window first. If your key is stolen, your recovery account presses <b>Panic</b> and the money comes back with no vote. If you are scammed, your evidence is read by an AI inside a TEE — encrypted even from us — and the contract checks that the procedure was followed before the council decides.
            </>
          ) : (
            <>
              Undo adalah USDC yang dibungkus (rUSDC, 1:1). Setiap transfer pending dulu selama jendela undo. Kalau kuncimu dicuri, akun pemulihanmu menekan <b>Panik</b> dan uangnya kembali tanpa voting. Kalau kamu ditipu, buktimu dibaca AI di dalam TEE — terenkripsi bahkan dari kami — dan kontrak membuktikan prosedurnya sebelum dewan memutus.
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link href="/dompet" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
            {t("Coba dompet demo", "Try the demo wallet")}
          </Link>
          <Link href="/janji" className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800">
            {t("Lihat janji yang dikunci kode", "See the promises enforced by the code")}
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="mb-2 font-semibold">{t("Kunci dicuri", "Key stolen")}</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-600 dark:text-stone-300">
            <li>{t("Pencuri mengirim 90% saldomu. Di sisi pencuri uangnya hanya pending.", "A thief sends 90% of your balance. On the thief's side the money is only pending.")}</li>
            <li>{t("Dari akun pemulihan, kamu tekan PANIK: transfer dibekukan, akun dikunci.", "From the recovery account you press PANIC: the transfer is frozen and the account is locked.")}</li>
            <li>{t("Tidak dibantah → siapa saja menekan Finalisasi, uang ke akun pemulihan. Tanpa voting.", "Not contested → anyone presses Finalize and the money goes to the recovery account. No vote.")}</li>
          </ol>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="mb-2 font-semibold">{t("Ditipu penjual palsu", "Scammed by a fake seller")}</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-600 dark:text-stone-300">
            <li>{t("Laporkan selama uang masih pending (bond kecil).", "Report while the money is still pending (small bond).")}</li>
            <li>{t("Kedua pihak mengirim bukti, dienkripsi di browser ke model NEAR AI di TEE.", "Both sides submit evidence, encrypted in the browser for the NEAR AI model in the TEE.")}</li>
            <li>{t("Kontrak memverifikasi tanda tangan TEE, prompt resmi, dan kelengkapan bukti; dewan DAO memutus.", "The contract verifies the TEE signature, the official prompt and that the evidence is complete; the DAO council decides.")}</li>
          </ol>
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
        <h2 className="mb-2 font-semibold">{t("Toko langganan? Kontak tepercaya", "A regular shop? Trusted contacts")}</h2>
        <p className="text-sm text-stone-600 dark:text-stone-300">
          {t(
            "Pembayaran ke kontak yang sudah aktif langsung final, jadi toko tidak perlu menunggu jendela. Kontak baru baru aktif setelah jeda (5 menit di demo), notifikasi muncul, dan Panik atau akun pemulihan bisa membatalkannya, jadi pencuri tidak bisa sekadar menambahkan dirinya.",
            "Payments to an active contact are final at once, so a shop does not wait for the window. A new contact only becomes active after a delay (5 min on the demo), an alert shows up, and panic or the recovery account can cancel it, so a thief cannot just add himself.",
          )}
        </p>
      </section>

      <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        {t(
          "Prior art yang kami akui: ERC-20R (Stanford 2022), REVERSO, SLOW, Circle Refund Protocol, Payy Finality. Yang baru dari Undo: sengketa yang buktinya tetap rahasia bahkan dari operator, tapi prosedur dan putusannya terbukti di kontrak.",
          "Prior art we acknowledge: ERC-20R (Stanford 2022), REVERSO, SLOW, Circle Refund Protocol, Payy Finality. What is new in Undo: a dispute whose evidence stays secret even from the operator, while its procedure and verdict are proven in the contract.",
        )}
      </section>
    </div>
  );
}
