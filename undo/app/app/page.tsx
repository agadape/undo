import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="space-y-3 pt-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ctrl+Z untuk USDC.</h1>
        <p className="max-w-2xl text-stone-600 dark:text-stone-300">
          Undo adalah USDC yang dibungkus (rUSDC, 1:1). Setiap transfer pending dulu selama jendela undo. Kalau kuncimu dicuri, akun pemulihanmu menekan <b>Panik</b> dan uangnya kembali tanpa voting. Kalau kamu ditipu, buktimu dibaca AI di dalam TEE — terenkripsi bahkan dari kami — dan kontrak membuktikan prosedurnya sebelum dewan memutus.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link href="/dompet" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
            Coba dompet demo
          </Link>
          <Link href="/janji" className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800">
            Lihat janji yang dikunci kode
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="mb-2 font-semibold">Kunci dicuri</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-600 dark:text-stone-300">
            <li>Pencuri mengirim 90% saldomu. Di sisi pencuri uangnya hanya pending.</li>
            <li>Dari akun pemulihan, kamu tekan PANIK: transfer dibekukan, akun dikunci.</li>
            <li>Tidak dibantah → siapa saja menekan Finalisasi, uang ke akun pemulihan. Tanpa voting.</li>
          </ol>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="mb-2 font-semibold">Ditipu penjual palsu</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-600 dark:text-stone-300">
            <li>Laporkan selama uang masih pending (bond kecil).</li>
            <li>Kedua pihak mengirim bukti, dienkripsi di browser ke model NEAR AI di TEE.</li>
            <li>Kontrak memverifikasi tanda tangan TEE, prompt resmi, dan kelengkapan bukti; dewan DAO memutus.</li>
          </ol>
        </div>
      </section>

      <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        Prior art yang kami akui: ERC-20R (Stanford 2022), REVERSO, SLOW, Circle Refund Protocol, Payy Finality. Yang baru dari Undo: sengketa yang buktinya tetap rahasia bahkan dari operator, tapi prosedur dan putusannya terbukti di kontrak.
      </section>
    </div>
  );
}
