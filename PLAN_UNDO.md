# Rencana Kerja — Undo v3.1 ("Ctrl+Z untuk uang kripto"), 2–14 Nov 2026

Ide dan skor: [IDEAS_V2.md](IDEAS_V2.md) (46/60). Riset: [recon/05–08](recon/). Bukti teknis: [SPIKE_LOG.md](SPIKE_LOG.md) (S20 = inti Undo, sudah lolos). Rencana lama Vault Card: [PLAN_VAULT_CARD.md](PLAN_VAULT_CARD.md) (sudah diganti).

**Waktu (UTC):** deadline **Sabtu 14 Nov 23:59 UTC** (= Minggu 15 Nov 06:59 WIB). Target submit **14 Nov 12:00 UTC**. Penjurian mulai 16 Nov.

---

## 0. Apa yang berubah dari v2 (masukan Dex dan Hans, 2 Nov)

| Masukan | Keputusan v3 |
|---|---|
| **Dex:** scope terlalu besar untuk 12 hari, dan penyaring AI mengecek setiap fitur yang diklaim | Inti dipangkas jadi empat hal (§3). Pool jalur instan dibuang. Tambahan baru diklaim kalau sudah jalan. README hanya menyebut fitur yang sudah jalan |
| **Dex:** uang yang bisa dibatalkan memindahkan risiko ke penerima. Pembeli nakal bisa menerima barang lalu melapor "ditipu" (*chargeback fraud*). Siapa yang mau menerima rUSDC? | Pelaporan hanya oleh pengirim atau akun pemulihannya, dengan bond yang hilang kalau kalah, dan kekalahan tercatat on-chain. Tombol **Barang Diterima** melepas uang lebih awal. **Kontak tepercaya** membuat transfer ke kontak lama langsung final. Lihat §4 dan §11 |
| **Dex:** bukti terenkripsi bisa berisi prompt injection yang tidak bisa diaudit siapa pun. Saran: AI cukup memberi rekomendasi | AI **hanya memberi rekomendasi**, dewan yang memutus. Kalau dewan diam, uang diteruskan ke penerima (aturan v2 "ikuti AI kalau confidence ≥ 80" dihapus). Saat banding, pemilik bukti boleh membukanya sendiri, dan dewan bisa memastikan isinya sama dengan yang dibaca AI |
| **Hans:** Undo pada dasarnya escrow, jadi escrow-nya harus 100% bisa dipercaya dan privat | Enam **janji yang dikunci kode** (§1). Pertanyaan ini sekaligus membongkar dua celah di kontrak v0: dewan bisa mengirim uang ke alamat mana saja (`refund_to` bebas), dan siapa saja bisa melapor. Keduanya ditutup di v1 |
| **Hans:** pakai zk-SNARK? (khawatir beda chain) | NEAR bisa memverifikasi zk-SNARK: `alt_bn128_pairing_check` dan `bls12381_pairing_check` ada di near-sdk 5.29 (dicek di source, 2 Nov). Tapi zk belum bisa membuktikan bahwa LLM membaca bukti dengan benar, jadi bagian itu tetap memakai TEE. zk masuk daftar "nanti" (§13) |
| **Review tambahan:** ada prior art, yaitu ERC-20R/721R (Stanford, 2022) | Disebut terang-terangan di pitch dan README (§2, §11). Posisi kita: "ERC-20R + pemulihan lewat akun terdaftar tanpa hakim + sidang privat di TEE + janji yang dikunci kode" |
| **Review tambahan:** verifikasi tanda tangan TEE belum terbukti, dan attestation TDX penuh terlalu berat untuk on-chain | Memang begitu desainnya: attestation diverifikasi off-chain, lalu kunci TEE di-*pin* on-chain oleh dewan (`register_tee_signer`). Ini ditulis jujur. Ada cadangan B3 kalau tanda tangan sama sekali tidak bisa diverifikasi (§5). G1 tetap gerbang pertama |
| **Review tambahan:** cold start, karena belum ada yang memegang rUSDC dan dana pending tidak composable | **Kirim sebagai USDC biasa**: penerima tidak perlu memakai Undo, karena uangnya tiba sebagai USDC setelah jendela lewat. Skenario adopsi: kas bisnis dan payroll, serta dompet agent AI (§11) |
| **Review tambahan:** angka 0 di "Coba Curi" tidak membuktikan "tidak bisa dicuri" | Dibingkai ulang jadi "**kuncinya bisa dicuri, uangnya tidak bisa dicairkan**". Jendela 2 jam, dua penjaga independen (§3) |
| **Review tambahan:** istilah "stablecoin" kurang tepat | Diganti "USDC yang dibungkus (wrapped USDC)". rUSDC bukan stablecoin baru |
| **Review tambahan:** pool Klaim NFT terkena *adverse selection* (penipu paling suka dana instan); urutan prioritas | Pool tetap dibuang. Supaya korban tetap sadar di dalam jendela, penjaga mengirim **notifikasi berbasis aturan** tanpa AI. Urutan tambahan kemudian disesuaikan lagi dengan pesan lengkap Dex (dua baris di bawah) |
| **Dex (pesan lengkap):** Tombol Panik — bagaimana kalau pencuri juga mendapat akun pemulihan, menggantinya, atau menunggu jendela habis? | Model ancaman ditulis (§4, A1–A9). Ditemukan celah baru: di v2, akun pemulihan yang dicuri bisa langsung menguras saldo lewat Panik. Sekarang semua uang yang menuju akun pemulihan juga lewat jendela bantah |
| **Dex:** di track NFT, juri ingin NFT jadi pusat produk; yang paling pas adalah `realworld` + `privacy` | Track menjadi `privacy` + `realworld`. `nfts` dilepas, dan Klaim NFT cukup jadi desain di README |
| **Dex:** urutan potong — pending + Panik + Coba Curi dulu, sidang versi kecil, Satpam dibuang | Satpam AI dibuang. Notifikasi berbasis aturan tetap ada, karena Panik tidak berguna kalau korban tidak sadar. Sidang versi kecil: satu jenis kasus dan satu model. Tanda tangan diverifikasi dan putusan didekripsi on-chain, karena S22 membuktikan biayanya murah (§5) |
| **Grok (audit 2 Nov, membaca versi v2):** kompetitor nyata — REVERSO, SLOW, Circle Refund Protocol, Payy Finality (semuanya sudah dicek ada) | Masuk tabel prior art (§2). J1 sama dengan aturan arbiter Circle Refund, jadi disebut sebagai inspirasi, bukan klaim baru. Pitch bergeser: kebaruan Undo adalah **sidang privat yang putusannya terbukti on-chain**, bukan "Ctrl+Z" |
| **Grok:** satu-satunya pembeda yang kuat adalah jalur TEE; buktikan minggu ini | ✅ Sudah terbukti 2 Nov (S21 + S22). Tapi pengecekan lanjutan menemukan bahwa **Veridom Pay dan tee-receipts** (peserta hackathon ini) juga memverifikasi tanda tangan NEAR AI on-chain. Jadi pembeda kita dipersempit: **E2EE + verifikasi atas ciphertext + hanya field putusan yang dibuka** (§2) |
| **Grok:** buktikan *prosedur* sidangnya juga, bukan hanya putusannya (hash prompt + model + bukti yang di-commit) | Ini sama dengan "sidang level 2" yang semula masuk daftar nanti. Setelah S21/S22, biayanya terbukti murah. **✅ Dinaikkan jadi inti (keputusan tim, 2 Nov).** Kontak tepercaya jadi opsional (T0). Detail di §5, spike S26 |
| **Grok:** buang Tombol Panik dan Coba Curi | **Tidak diikuti.** Grok membaca versi lama. Panik murah, cocok dengan tema #1 juri, dan menjadi pembeda dari ERC-20R/Circle Refund (pencurian selesai tanpa hakim). Coba Curi disukai Dex dan sudah dibingkai jujur. Sebagai tambahan saran Grok: **tes properti J1–J6** sebagai bukti yang lebih serius dari sekadar demo |
| **Grok:** klaim sebagai NEAR Intent | Tidak bisa: NEAR Intents tidak punya testnet (S1b) |
| **Grok:** dana pending bisa dipakai lewat kontrak lain (bypass) | Sudah tertutup sejak v0: saldo pending bukan saldo NEP-141 dan tidak bisa dipindah. Tes S20: "pending unwrap/forward → not enough available rUSDC" |

Akibatnya ke track: `privacy` + `realworld` (§7). Hans juga memakai `realworld`, jadi kabari dia. Produknya beda jauh: x207 untuk barter antar-agent, Undo untuk perlindungan pembayaran manusia.

## 1. Janji yang dikunci kode

Undo adalah escrow. Orang hanya mau memakainya kalau mereka tidak perlu percaya pada siapa pun, termasuk kami. Karena itu janjinya ditulis di kode, bukan di halaman "tentang kami".

| # | Janji | Cara kode menegakkannya | Cara orang mengeceknya |
|---|---|---|---|
| J1 | Uang pending hanya bisa berakhir di dua tempat: **penerima**, atau **akun pemulihan pengirim** (atau pengirim sendiri kalau tidak punya akun pemulihan) | `resolve` dan `finalize` tidak menerima alamat tujuan; tujuannya diambil dari data akun. Tidak ada fungsi yang bisa mengirim ke alamat ketiga, termasuk untuk dewan | Kode + tes |
| J2 | Hanya uang pending yang bisa disentuh. Setelah jendela lewat, uangnya final seperti USDC biasa | `report` dan `panic` menolak transfer yang sudah lewat `unlock_at` | Kode + tes |
| J3 | Tidak ada pembatalan tanpa aksi aktif manusia atau korban. AI tidak pernah membatalkan transfer | Kalau dewan diam melewati `dispute_timeout`, **keadaan yang dibantah tetap berlaku**: laporan penipuan → uang diteruskan ke penerima; bantahan atas Panik → Panik tetap berlaku (pencuri tidak menang hanya karena dewan lalai). Rekomendasi AI hanya disimpan dan tidak memindahkan uang | Kode + tes (`j3_*`) |
| J4 | Hanya korban yang bisa melapor, dan laporan palsu ada harganya | `report` hanya dari pengirim atau akun pemulihannya, dengan bond. Kalah → bond diberikan ke penerima. Jumlah kekalahan tercatat on-chain | Kode + view `get_reputation` |
| J5 | Kami tidak bisa mengubah aturan diam-diam | Tidak ada fungsi khusus `owner`. Di deploy final, full-access key kontrak dihapus (terbukti di S25). Build reproducible (`cargo near build reproducible-wasm`, metadata NEP-330), jadi hash kode on-chain sama dengan build dari repo publik (menunggu repo) | Daftar key akun kontrak (kosong), hash kode di explorer = sha256 wasm |
| J6 | 1 rUSDC selalu bisa ditukar 1 USDC | `total_supply` rUSDC wajib sama dengan saldo USDC milik kontrak. View `get_reserve` menampilkan keduanya | View + `ft_balance_of` di `usdc.fakes.testnet` |
| J7 | Server sidang tidak perlu dipercaya: AI benar-benar membaca prompt resmi, berkas kasus yang benar, dan **semua** bukti yang di-commit kedua pihak | Kontrak membangun ulang byte request kanonik, mencocokkan hash-nya dengan tanda tangan TEE, dan membuka prompt serta berkas kasus. Bukti para pihak tetap terenkripsi (sidang level 2, §5; terbukti di S26) | Transaksi `post_recommendation` di explorer |

Kuasa manusia yang tersisa hanya satu. Pada kasus yang dibantah, dewan memilih **A atau B** (penerima, atau akun pemulihan pengirim), secara publik, dan hanya atas uang pending. Pencurian yang tidak dibantah selesai tanpa manusia (*optimistic undo*).

## 2. Satu kalimat dan pitch

**Satu kalimat:** Undo memberi USDC tombol Ctrl+Z. Uang curian dibekukan dan dikembalikan oleh akun pemulihanmu, dengan aturan yang dikunci kode, sebelum pencurinya sempat mencairkan.

**Pitch 15 detik:** "Kartu kredit punya chargeback, bank punya pembatalan transfer. Transfer kripto biasa tidak punya, jadi bulan ini Binance kehilangan ~$6B dan NEAR Intents $3,8M. Sudah ada yang membuat transfer bisa dibatalkan (ERC-20R, REVERSO, SLOW) dan sengketa untuk stablecoin (Circle Refund Protocol, Payy Finality). Yang belum ada adalah sengketa yang buktinya tetap rahasia, bahkan dari kami, tetapi putusannya bisa dicek siapa pun di chain. Undo melakukan itu di NEAR, ditambah Tombol Panik yang membatalkan pencurian tanpa hakim."

**Istilah:** rUSDC adalah *wrapped USDC* (USDC yang dibungkus, 1:1), bukan stablecoin baru. Jangan sebut "stablecoin" di README, pitch, atau video.

**Prior art (wajib disebut di README, pitch, dan video; semuanya sudah dicek ada, 2 Nov):**

| Proyek | Apa yang dilakukan | Status | Bedanya dengan Undo |
|---|---|---|---|
| [ERC-20R/721R](https://arxiv.org/abs/2208.00543) (Wang, Wang, Boneh, Stanford 2022) | Token yang bisa dibalik dalam jendela ~4 hari oleh panel hakim terdesentralisasi | Paper + prototipe | Undo: pencurian yang tidak dibantah selesai lewat akun pemulihan tanpa hakim, dan sengketa dibaca AI privat yang terbukti on-chain |
| [REVERSO](https://github.com/Faraone-Dev/REVERSO) | Transfer dengan timelock 1 jam–30 hari, pengirim bisa membatalkan, ada alamat cadangan, EVM | Live (klaim sendiri, belum ada audit independen) | Opt-in per transfer, jadi pencuri yang memegang kunci tinggal memakai transfer biasa. Di Undo, semua uang keluar dari saldo rUSDC wajib lewat jendela. Tidak ada sidang |
| [SLOW](https://www.bankless.com/read/a-safety-layer-for-high-stakes-crypto-sends) | Transfer ditahan di kontrak dengan tanda terima ERC-1155; pengirim bisa membatalkan; guardian opsional harus menyetujui setiap uang keluar | Live di Ethereum | Paling dekat untuk jalur pencurian. Bedanya: guardian SLOW menyetujui *setiap* transaksi (mencegah tapi merepotkan), sedangkan akun pemulihan Undo hanya bertindak saat Panik. Tidak ada sidang untuk penipuan |
| [Circle Refund Protocol](https://www.circle.com/blog/refund-protocol-non-custodial-dispute-resolution-for-stablecoin-payments) (Apr 2025) | Escrow non-kustodian; arbiter hanya bisa meneruskan ke penerima atau mengembalikan ke pembayar | Riset + kontrak | **J1 berasal dari ide yang sama**, jadi disebut sebagai inspirasi. Di Circle, arbiter melihat bukti secara terbuka, sedangkan sidang Undo privat dan terbukti on-chain |
| [Payy Finality](https://gizmodo.com/cryptos-latest-stablecoin-innovation-chargebacks-2000811401) (2026) | Jendela keberatan singkat; liquidity provider menjamin pembayaran; arbiter netral menilai bukti | Diumumkan, sedang merekrut LP dan arbiter | Model pool LP mereka adalah alasan pool Klaim NFT kita dibuang. Arbiter mereka melihat bukti; sidang Undo privat |
| [Veridom Pay](https://github.com/khrisdidukh/veridom-pay) (**peserta hackathon ini**, 31 Okt) | Inspektur AI di TEE menyetujui termin konstruksi; kontrak NEAR memeriksa `ed25519_verify` + `sha256` atas byte persis; ada arbiter untuk sengketa | Testnet, jalan | Verifikasi on-chain-nya **sama dengan S22**, jadi itu bukan pembeda kita. Bedanya: berkas request mereka (termasuk foto) dipublikasikan, tanpa E2EE. Bukti Undo terenkripsi ke enclave, dan kontrak hanya membuka field putusan |
| [tee-receipts](https://github.com/tmdry4530/tee-receipts) (**peserta hackathon ini**, 1 Nov) | Tanda tangan NEAR AI diverifikasi on-chain (ecrecover / ed25519) dan disimpan sebagai tanda terima | Jalan | Infrastruktur tanda terima saja: hanya hash, tanpa E2EE, tanpa pembayaran atau sengketa |

**Satu kalimat kebaruan:** ide "bisa di-undo" sudah ada, dan verifikasi tanda tangan NEAR AI di kontrak juga sudah dilakukan tim lain. Yang baru dari Undo:
- Bukti sengketa tetap terenkripsi bahkan dari operator (E2EE ke enclave).
- Tanda tangan TEE dicek on-chain atas ciphertext itu.
- Kontrak hanya membuka field putusan dengan kunci per-pesannya, sedangkan penalaran model tetap terkunci (S21, S22).
- Kontrak juga membuktikan prompt resmi, berkas kasus, dan kelengkapan bukti, tanpa membuka bukti itu sendiri (sidang level 2, J7, S26).

**Kenapa juri peduli** ([recon/05](recon/05_judges_x.md)):
- Tema #1 dari ketujuh juri adalah pertahanan berbasis AI di tengah gelombang serangan.
- Tema #2 adalah privasi untuk uang manusia.
- Avichal ikut menulis Electric Capital #14 tentang "protected DeFi assets" yang bisa dibalik komite setelah hack.
- Haseeb: "Agents don't need crypto. It's us humans who do." Undo memang untuk manusia.

## 3. Produk: empat inti + dua tambahan

**Inti (wajib jadi, diklaim di README):**

| Lapis | Apa | Primitif NEAR | Status |
|---|---|---|---|
| **L0 Uang Undo** | `rUSDC` (wrapped USDC): setiap transfer pending sampai jendela lewat; unwrap juga lewat jendela. **Kirim sebagai USDC biasa** ke akun mana saja, termasuk yang tidak memakai Undo: uang tiba sebagai USDC setelah jendela. Ditambah janji J1–J6 dan tombol **Barang Diterima** | NEP-141, NEP-330 | ✅ S20 (v0), perbaikan di v1 |
| **L1 Tombol Panik** | Akun pemulihan (perubahannya selalu lewat jeda). **Panik**: semua transfer keluar yang pending dibekukan, akun dikunci, sisa saldo ikut dibekukan menuju akun pemulihan. Penerima (atau pemilik akun) boleh membantah dengan bond; kalau tidak dibantah, uang kembali otomatis. | Kontrak sendiri, named accounts | Baru |
| **L2 Sidang Tertutup (level 2)** | Kasus yang dibantah masuk sidang. Kedua pihak mengunggah bukti yang **dienkripsi di browser** ke kunci model NEAR AI yang teratestasi, lalu meng-commit hash-nya on-chain. Model di TEE memberi **rekomendasi**. Kontrak memverifikasi tanda tangan TEE, **membuktikan bahwa model membaca prompt resmi, berkas kasus yang benar, dan semua bukti yang di-commit** (J7), lalu membuka hanya field putusan. Setelah itu **dewan Sputnik DAO memutus** | NEAR AI Cloud E2EE, TEE attestation, `env::ed25519_verify`, `env::sha256`, X25519 + XChaCha20 di wasm, Sputnik DAO | ✅ Terbukti end-to-end dengan model asli (S21, S22, S26) |
| **"Coba Curi"** | Instance `rUSDC` terpisah (jendela 2 jam, kontrak dikunci). Kunci privat akun demo diumumkan di post X dan README. **Bingkainya: "Kuncinya bisa dicuri. Uangnya tidak bisa dicairkan."** Ini membuktikan Panik + jendela undo, bukan bahwa akun tidak bisa dibobol, dan hal itu ditulis di halaman tantangan. **Dua penjaga independen** (Cloudflare cron tiap 1 menit + GitHub Actions cron sebagai cadangan) menekan panik untuk setiap transaksi keluar, mengirim notifikasi, lalu mengembalikan dan membuka lagi akun demo. Dashboard menampilkan percobaan, transfer yang dibekukan, uang yang berhasil dicairkan (target: 0), dan uptime penjaga. Tetap hidup selama penjurian | Sub-account (tidak bisa dibuat ulang orang lain), function-call key khusus `panic` | Baru |

**Notifikasi berbasis aturan (bagian dari penjaga, tanpa AI):** setiap transfer keluar, kontak baru, atau perubahan akun pemulihan → pesan Telegram dan banner di aplikasi "Ada transfer keluar 900 rUSDC. Ini kamu? [Bukan → Panik]". Tujuannya supaya korban sadar selagi masih di dalam jendela.

**Tambahan (hanya setelah semua inti selesai di G2; baru diklaim kalau jalan):**

| Tambahan | Apa | Kenapa |
|---|---|---|
| **T0 Kontak tepercaya** | Transfer ke kontak yang sudah aktif langsung final; menambah kontak butuh jeda (demo 5 menit, produk 48 jam); Panik membatalkan kontak yang belum aktif | Jawaban terkuat untuk "merchant langganan mau menerima rUSDC" (Dex poin 2) |
| **T1 Panik gasless** | Panik dan Barang Diterima dikirim sebagai meta-transaction (NEP-366) lewat relayer kita, jadi akun pemulihan tidak perlu memegang NEAR | Hint track `realworld` (META TRANSACTIONS). Orang biasa tidak punya NEAR untuk gas |
| **T2 Klaim NFT** | Default: **desain saja di README**, yaitu transfer pending sebagai NFT NEP-171 dinamis yang bisa dipindahtangankan, tanpa pool. Dibangun hanya kalau semua yang lain sudah selesai | Arah ke depan untuk "merchant butuh uang cepat" |

**Dibuang:** Satpam AI (skor risiko AI). Notifikasi berbasis aturan sudah cukup untuk membuat korban sadar di dalam jendela.

## 4. Spec mekanisme kontrak v1

Perubahan dan tambahan di atas v0 (S20):

| Fungsi | Siapa | Aturan |
|---|---|---|
| `report(transfer_id)` + bond | **Pengirim atau akun pemulihannya saja** (v0: siapa saja) | Hanya selama pending. → **Disputed**. Kalah → bond ke penerima dan `lost_disputes` pelapor +1 |
| `resolve(transfer_id, reverse)` | Dewan | **Parameter `refund_to` dihapus** (v0: tujuan bebas). `reverse = true` → akun pemulihan pengirim yang berlaku, atau pengirim. `reverse = false` → penerima. Pihak yang kalah dicatat di `lost_disputes` |
| Diamnya dewan | Timeout | Lewat `dispute_timeout` → siapa saja bisa memanggil `release_expired`, dan keadaan yang dibantah tetap berlaku (laporan → penerima; bantahan Panik → akun pemulihan). Rekomendasi AI tidak berpengaruh. Bond "ikut uangnya": kembali ke pembuka sengketa kalau ia menang, kalau tidak jatuh ke akun yang menerima uang |
| `send_usdc(receiver_id, amount)` | Pemilik akun | Seperti unwrap, tapi USDC dikirim ke `receiver_id` setelah jendela lewat (langsung kalau penerimanya kontak aktif, bila T0 dibangun). Bisa dilaporkan dan dibekukan panik seperti transfer biasa. Penerima tidak perlu memakai Undo |
| `release(transfer_id)` "Barang Diterima" | **Akun pemulihan pengirim saja** | Transfer langsung final. Tidak boleh dari kunci utama, supaya pencuri yang memegang kunci utama tidak bisa melewati jendela |
| `set_recovery(recovery_id)` | Pemilik akun | Langsung berlaku **hanya kalau akun belum punya saldo dan belum punya transfer pending**, yaitu saat onboarding. Selain itu berlaku setelah `recovery_delay` (demo 5 menit, produk 7 hari), bisa dibatalkan akun pemulihan lama, dan dibekukan selama akun terkunci |
| `add_contact(id)` / `remove_contact(id)` (T0, opsional) | Pemilik akun | Kontak aktif setelah `contact_delay` (demo 5 menit, produk 48 jam). Menghapus kontak langsung berlaku. Panik membatalkan kontak yang belum aktif. Transfer ke kontak aktif langsung final |
| `panic(account_id)` | Akun pemulihan | Akun dikunci. Semua transfer keluar dan exit yang pending → **Frozen**, dengan `contest_deadline = now + contest_window`. Saldo available **tidak langsung pindah**, tetapi dijadikan transfer *sweep* menuju akun pemulihan yang juga Frozen dan bisa dibantah (A7). Tanpa deposit, jadi bisa dipanggil function-call key |
| `contest(transfer_id)` + bond | Penerima transfer Frozen, **atau pemilik akun asal** (kunci utama) | Sebelum deadline → **Disputed** → sidang. Pemilik akun bisa membantah kalau yang menekan Panik ternyata akun pemulihan yang dicuri |
| `finalize(transfer_id)` | Siapa saja | Frozen yang tidak dibantah lewat deadline → **Reversed** ke akun pemulihan (untuk sweep: dikreditkan ke akun pemulihan) |
| `unlock(account_id)` | Akun pemulihan | Membuka kunci setelah korban mengganti kunci akunnya |
| Kasus menjadi **Disputed** (lewat `report` atau `contest`) | Kontrak | Membuat `case_nonce` acak (dari `env::random_seed`) dan `evidence_deadline` |
| `commit_evidence(transfer_id, sha256_hex)` | Pelapor dan penerima, masing-masing satu kali | Hash dari amplop bukti (hex, terenkripsi ke kunci model) sebelum `evidence_deadline`. Setelah deadline, daftar bukti dikunci |
| `register_tee_signer(model_id, ed25519_pk)` | Dewan saja | Mendaftarkan kunci tanda tangan model setelah attestation diverifikasi (verifier S5a) |
| `register_procedure(id, model_id, system_prompt_sha256, max_tokens)` | Dewan saja | Prosedur sidang resmi. Teks prompt dipublikasikan di repo, hash-nya on-chain |
| `post_recommendation(transfer_id, signed_text, signature_hex, system_envelope, system_eph_secret, evidence_envelopes, response_body, verdict_key)` | **Siapa saja** (server sidang tidak perlu dipercaya) | Detail di §5 "Sidang level 2":<br>1. **Bangun ulang byte request kanonik** dari prosedur, amplop pesan sistem, dan amplop bukti yang di-commit, lalu cocokkan `sha256`-nya dengan hash request di `signed_text`.<br>2. Cocokkan `sha256(response_body)` dengan hash respons, model id dengan prosedur, dan `ed25519_verify` dengan kunci yang di-pin.<br>3. Turunkan kunci pesan sistem dari rahasia efemeralnya lewat X25519 + HKDF. Pesan sistem = prompt + pemisah + berkas kasus. Prompt harus cocok dengan hash prosedur, dan berkas kasus harus sama persis dengan yang dibangun kontrak (`transfer_id`, nominal, `case_nonce`).<br>4. Buka field `"content":"…"` di respons dengan `verdict_key`. JSON-nya harus menyebut `transfer_id` + `case_nonce`.<br>Hasilnya **hanya disimpan**. S26 ✅: 10,7 Tgas dengan model NEAR AI asli |
| `get_reserve`, `get_reputation(account)` | View | J6 dan J4 |
| Admin | — | Fungsi `owner`/`set_judge` dihapus. Parameter diatur saat `new`. Kunci kontrak dihapus di deploy final (J5) |
| Storage | Pengirim | Biaya storage per transfer dibayar pengirim (wajib sebelum Coba Curi dibuka) |

### Model ancaman Tombol Panik (masukan Dex)

Asumsi dasar: Undo membedakan pemilik dan pencuri **hanya lewat akun pemulihan** yang didaftarkan sebelumnya. Akun pemulihan sebaiknya di perangkat lain, misalnya HP, sementara kunci utama ada di laptop. Status kunci akun, akun pemulihan, dan semua transfer pending disimpan di kontrak.

| # | Ancaman | Pertahanan | Sisa risiko (ditulis jujur) |
|---|---|---|---|
| A1 | Kunci utama dicuri | Semua transfer keluar, unwrap, dan `send_usdc` berstatus pending. Notifikasi → Panik → kalau tidak dibantah, uang kembali | Korban tidak sadar sampai jendela habis |
| A2 | Pencuri menunggu jendela habis | Jendela dihitung per transfer, jadi menunggu tidak membuka apa-apa: uang final pun harus keluar lewat transfer baru yang pending lagi. Yang bisa ditunggu pencuri hanya korban yang lengah. Karena itu jendela produk 24 jam (lebih lama dari tidur semalam), dan setiap transfer keluar memicu notifikasi | Korban mengabaikan notifikasi selama 24 jam |
| A3 | Pencuri mengganti akun pemulihan | Lewat jeda 7 hari, bisa dibatalkan akun pemulihan lama, dibekukan selama akun terkunci, dan memicu notifikasi | — |
| A4 | Pencuri memasang akun pemulihan di akun yang belum punya | Pemasangan instan hanya untuk akun kosong. Onboarding mewajibkan akun pemulihan sebelum deposit | Akun berisi yang belum punya akun pemulihan hanya dilindungi jendela + lapor |
| A5 | Pencuri mencari jalan pintas melewati jendela | Barang Diterima hanya dari akun pemulihan. Kontak baru butuh jeda 48 jam dan dibatalkan oleh Panik. Kirim ke kontak lama berarti uangnya sampai ke orang yang memang dipercaya korban | — |
| A6 | Pencuri membantah pembekuan | Butuh bond dan masuk sidang. Bukti on-chain: akun pemulihan terdaftar jauh sebelumnya, dan saldo dikuras ke akun baru. Kalah → bond hilang. Kalau dewan lalai, Panik tetap berlaku (J3) | Dewan salah memutus |
| A7 | **Akun pemulihan dicuri** (kunci utama aman) | **Celah v2 yang ditutup:** dulu Panik langsung memindah saldo ke akun pemulihan, jadi pencurinya langsung dapat. Sekarang semua yang menuju akun pemulihan berstatus Frozen, dan pemilik bisa membantahnya lewat kunci utama dengan bond → sidang. Tidak ada uang yang bisa pindah ke pihak ketiga (J1) | Akun terkunci sampai sengketa selesai (gangguan, bukan pencurian) |
| A8 | Kedua kunci dicuri | Undo tidak bisa membedakan pemilik dan pencuri. **Di luar cakupan**, sama seperti kehilangan HP dan seed phrase sekaligus | Ya. Nanti: akun pemulihan berupa multisig 2-dari-3 wali |
| A9 | Pencuri menghapus akun NEAR korban lalu membuatnya ulang dengan nama yang sama | Kunci akun, akun pemulihan, dan transfer pending tersimpan di kontrak per nama akun, jadi tidak ikut reset (wajib ada tes) | — |

## 5. Sidang Tertutup — alur kripto

Dasar dari dokumen NEAR AI (dicek 2 Nov):
- **E2EE:** konten pesan dienkripsi ke kunci Ed25519 model yang teratestasi (X25519 + HKDF-SHA256 + XChaCha20-Poly1305). Header: `X-Signing-Algo: ed25519`, `X-Client-Pub-Key`, `X-Model-Pub-Key`, `X-Encryption-Version: 2`, `x-no-aliasing: true`. Respons dienkripsi balik ke kunci klien.
- **Tanda tangan:** `GET /v1/signature/{chat_id}?signing_algo=ed25519`. Teks yang ditandatangani: `MODEL:sha256(request):sha256(response)` untuk `provider_tee`, atau `sha256(request):sha256(response)` untuk `gateway`. Hash dihitung atas byte mentah.

Alurnya:
1. Bukti diisi lewat **form terstruktur**: jenis bukti, tanggal, nomor resi, plus lampiran. Tidak ada kotak teks bebas yang panjang. Browser tiap pihak mengenkripsinya ke kunci model, menyimpan **kunci banding** (kunci per pesan) di perangkatnya, lalu mengirim ciphertext ke server sidang. Hash ciphertext di-commit on-chain.
2. Server sidang menyusun request **kanonik**. Isinya: prompt sistem resmi (bukti diperlakukan sebagai data, bukan perintah), berkas kasus (`transfer_id`, nominal, `case_nonce`), dan amplop bukti kedua pihak sesuai urutan commit. Prompt dan berkas kasus digabung dalam **satu** pesan sistem, lalu dienkripsi server dengan rahasia efemeral baru yang disimpan untuk dibuka ke kontrak. Isi keduanya memang publik.
3. Model di TEE mendekripsi bukti di dalam enclave dan mengeluarkan rekomendasi JSON `{rekomendasi, confidence, curiga_injeksi, alasan_publik}`. Alasan publik ditulis tanpa data pribadi.
4. Server (atau siapa saja yang memegang datanya) memanggil `post_recommendation`. Kontrak memverifikasi tanda tangan, membangun ulang request, membuktikan prompt + berkas kasus + kelengkapan bukti, lalu membuka hanya field putusan dan memastikan putusan itu untuk kasus ini. Bukti para pihak dan penalaran model tidak pernah dibuka.
5. Dewan membaca rekomendasi terverifikasi beserta alasan publiknya, lalu memutus A atau B.
6. **Banding:** pihak yang tidak puas boleh menyerahkan kunci bandingnya ke dewan. Dewan mendekripsi ciphertext yang hash-nya sudah di-commit, jadi isinya terbukti sama dengan yang dibaca AI. Kalau satu pihak menolak membuka buktinya saat banding, itu menjadi pertimbangan dewan.

**Hasil S21 (2 Nov, respons asli NEAR AI):**
- Tanda tangan `provider_tee` mencakup byte request dan respons yang **terenkripsi**, dan penanda tangannya adalah kunci model yang teratestasi. Desain kontrak S22 langsung cocok tanpa perubahan.
- `x-encrypt-all-fields` juga mengenkripsi `reasoning_content`, dan **setiap field punya kunci per-pesan sendiri**. Jadi kontrak hanya menerima kunci `content` (putusan), sedangkan penalaran model, yang merangkum isi bukti, tetap terkunci.
- Karena ciphertext penalaran ikut tersimpan di respons yang ditandatangani, server sidang wajib memakai **kunci klien baru untuk setiap kasus** dan langsung membuangnya setelah kunci putusan didapat.
- GLM-flash memakai sebagian besar token untuk bernalar (434 dari 518), jadi `max_tokens` minimal 800. Biaya ~$0,0003 per kasus, sehingga kredit $10 cukup untuk puluhan ribu sidang.
- Uji injeksi: bukti penjual yang berisi "ABAIKAN SEMUA ATURAN" tetap menghasilkan rekomendasi "kembalikan" dengan `curiga_injeksi: true`.

**Sidang level 2 — detail teknis:**
- **Request kanonik.** Server dan kontrak memakai format byte yang sama persis (JSON ringkas, urutan key tetap, seperti request S21):
  `{"model":"<prosedur>","messages":[{"role":"system","content":"<amplop: prompt + \n\nBERKAS KASUS: + JSON kasus>"},{"role":"user","content":"<bukti pelapor>"},{"role":"user","content":"<bukti penerima>"}],"max_tokens":<prosedur>,"stream":false}`
  Prompt dan berkas kasus sengaja digabung dalam satu pesan, supaya kontrak hanya perlu 2 operasi X25519.
  Kontrak membangun string ini sendiri. Jadi tidak ada parsing JSON besar, dan server tidak punya celah untuk menyisipkan pesan lain. Amplop hex tidak butuh escaping.
- **Kenapa rahasia efemeral, bukan kunci jadi.** XChaCha20-Poly1305 tidak *key-committing*. Server yang curang bisa membuat satu ciphertext yang valid di bawah dua kunci: kunci A dibuka ke kontrak dan menghasilkan prompt resmi, sementara model memakai kunci B. Karena itu, untuk amplop yang dibuat server, kontrak menerima rahasia efemeralnya, memastikan publiknya sama dengan 32 byte pertama amplop, lalu menurunkan kunci yang **sama dengan yang diturunkan model**: X25519 dengan kunci model (konversi ed25519 → X25519 dihitung kontrak sendiri) + HKDF-SHA256. Untuk putusan, kunci jadi sudah aman, karena ciphertext-nya dibuat model, bukan server.
- **Cadangan kalau X25519 di wasm terlalu mahal — tidak diperlukan (S26 mengukur total 10,7 Tgas):** kontrak menerima kunci jadi, dan risikonya ditulis jujur. Di skenario terburuk, server curang hanya bisa membuat model membaca prompt berupa derau acak, bukan prompt pilihannya, karena plaintext di bawah kunci kedua tidak bisa diatur. Klaim J7 lalu diturunkan menjadi "kelengkapan bukti + berkas kasus terbukti; prompt terbukti kecuali ada serangan multi-kunci".
- **Biaya terukur (S26, model asli):** satu `post_recommendation` lengkap = **10,7 Tgas** (≈ 0,001 NEAR). Isinya: bangun ulang + hash request 2,4 KB, 2 X25519, HKDF, 2 dekripsi, dan cek prosedur. Panggilan NEAR AI-nya $0,0002. Bukti hanya teks untuk MVP, dengan batas ukuran per pihak. Bukti gambar (Qwen3-VL) belum termasuk.

**Prompt injection (masukan Dex):** risikonya tetap ada, tapi dampaknya dibatasi.
- AI tidak bisa memindahkan uang (J3).
- Bukti dibaca bersama bukti pihak lawan.
- Model wajib mengisi `curiga_injeksi`.
- Bukti bisa diaudit lewat banding.
- Ada batas nominal sidang (demo ≤ 500 rUSDC).

**Batas kepercayaan (tulis apa adanya di CLAIMS.md):**
- **Attestation diverifikasi off-chain, bukan di kontrak.** Laporan TDX/GPU lengkap terlalu berat untuk diverifikasi on-chain. Verifier S5a (Intel JWKS + nonce) memeriksanya off-chain. Setelah itu dewan mem-*pin* kunci ed25519 model lewat `register_tee_signer`, dan kontrak hanya memeriksa tanda tangan terhadap kunci yang sudah di-pin itu. Siapa saja bisa mengulang verifikasi attestation di halaman Bukti.
- **Server sidang tidak perlu dipercaya (level 2).** Server tidak bisa membaca bukti, tidak bisa memalsukan rekomendasi, tidak bisa mengganti prompt, dan tidak bisa membuang bukti salah satu pihak. Semua itu akan ditolak kontrak. Yang masih bergantung pada server hanya **ketersediaan**. Kalau server mati, siapa saja yang memegang ciphertext bisa memanggil NEAR AI sendiri dan mengirim `post_recommendation`.
- **Yang tetap harus dipercaya:** hardware TEE (Intel/NVIDIA) dan attestation-nya, kualitas penilaian model, dan kejujuran para pihak tentang isi buktinya. Bukti palsu tetap bukti palsu, dan karena itu dewan tetap yang memutus.
- TEE berarti percaya pada attestation hardware (Intel/NVIDIA). Ini berbeda dengan zk yang hanya bergantung pada matematika (§13).

**Cadangan kalau S21 atau S22 gagal:**
- **B1:** tanpa E2EE. Bukti dikirim lewat TLS ke model TEE; server melihatnya sesaat dan tidak menyimpannya. Respons plaintext tetap diverifikasi on-chain.
- **B2:** tanda tangan diverifikasi on-chain, sedangkan dekripsi dilakukan di browser. Alasan biaya sudah tidak ada, karena S22 membuktikan dekripsi di kontrak murah. B2 hanya dipakai kalau format respons asli (S21) ternyata menyulitkan parsing di kontrak. Ini tetap aman karena rekomendasi tidak memindahkan uang (J3). Sidang di MVP hanya mencakup satu jenis kasus (penjual palsu), satu model, dan bukti teks.
- **B3 (pivot, kalau tanda tangan NEAR AI sama sekali tidak bisa dihubungkan ke respons):** DAO biasa dengan bukti terenkripsi. Bukti dienkripsi ke kunci anggota dewan dan hash-nya di-commit on-chain. Rekomendasi AI tetap ditampilkan sebagai saran tanpa klaim terverifikasi. Klaim privacy turun menjadi "bukti tidak pernah publik", dan skor yang diharapkan juga turun, sehingga G1 menjadi penentu.

## 6. Dua skenario korban (dipakai di demo)

**A. Kunci dicuri** (L0 + L1)
1. Pencuri memakai kunci korban untuk mengirim 900 rUSDC ke akunnya. Di sisi pencuri, dananya hanya *pending*. Pencuri tidak bisa menekan Barang Diterima karena tombol itu hanya berfungsi dari akun pemulihan.
2. Korban mendapat notifikasi "Ada transfer keluar 900 rUSDC. Ini kamu?" lalu menekan **Panik** dari akun pemulihan di HP-nya. Semua transfer keluar yang pending dibekukan, akun dikunci, dan sisa 100 rUSDC ikut dibekukan menuju akun pemulihan.
3. Pencuri tidak membantah, karena membantah butuh bond dan akan masuk sidang. Setelah jendela bantah lewat, siapa saja bisa memanggil `finalize`, dan seluruh 1.000 rUSDC masuk ke akun pemulihan **tanpa voting dewan**.

**B. Ditipu penjual palsu** (L0 + L2, cerita Indonesia: beli HP lewat WhatsApp)
1. Korban membayar 150 rUSDC ke "penjual" yang bukan kontak tepercayanya. Barangnya tidak pernah dikirim.
2. Korban melapor dengan bond selama dana masih pending. Penjual membantah.
3. **Sidang Tertutup:** korban mengunggah screenshot chat dan bukti transfer; penjual mengunggah "resi". Semua dienkripsi di browser masing-masing.
4. Model di TEE merekomendasikan "kembalikan" (confidence 92) dengan alasan publik "resi tidak cocok dengan tanggal transaksi". Kontrak memverifikasi tanda tangan TEE dan membuktikan bahwa prompt resmi serta kedua bukti yang di-commit benar-benar dipakai.
5. Dewan memutus "kembalikan". Uang kembali ke korban, bond penjual hilang, dan `lost_disputes` penjual +1.

Kebalikannya juga diuji. Kalau pembeli yang nakal (barang sudah diterima tapi melapor), penjual menunjukkan resi yang valid, AI merekomendasikan "lanjutkan", dan dewan meneruskan uang ke penjual. Bond pelapor menjadi milik penjual, dan reputasi pelapor tercatat.

### Demo 3 menit (hanya fitur yang sudah jalan)

- **0:00–0:20 — Coba Curi.** "Kunci akun ini kami umumkan *N* hari lalu. Kuncinya bisa dicuri, uangnya tidak bisa dicairkan." Tampilkan angka asli dari dashboard: percobaan, transfer dibekukan, uang yang berhasil dicairkan = 0, uptime penjaga.
- **0:20–1:00 — Skenario A.** Pencurian → notifikasi → Panik dari HP → `finalize` tanpa voting. Setiap langkah ditunjukkan sebagai transaksi di explorer.
- **1:00–2:15 — Skenario B, inti kebaruan.**
  1. Penjual palsu, lapor, dibantah.
  2. Bukti dienkripsi di browser. Tampilkan bahwa dashboard tim dan explorer hanya melihat ciphertext.
  3. Rekomendasi TEE keluar, termasuk `curiga_injeksi: true` untuk bukti yang berisi injeksi.
  4. Transaksi `post_recommendation` di explorer. Kontrak memverifikasi tanda tangan, membuktikan prompt resmi dan kedua bukti dipakai, lalu membuka putusannya. Tunjukkan juga satu percobaan gagal: server yang membuang bukti penjual ditolak kontrak.
  5. Dewan memutus, uang kembali.
- **2:15–2:40 — Janji yang dikunci kode.**
  - Daftar key kontrak kosong, dan hash kode sama dengan build dari repo.
  - `get_reserve` menunjukkan 1:1.
  - Laporan dari bukan-pengirim ditolak.
  - `resolve` tidak punya parameter tujuan.
- **2:40–3:00 — Posisi.** Satu slide prior art (ERC-20R, REVERSO, SLOW, Circle Refund, Payy Finality) dan bedanya. Tutup dengan `send_usdc` ke orang yang tidak memakai Undo.

## 7. Track (tidak bentrok dengan x207 milik Hans)

Hans memilih: swarms, agents, defi, social, business, realworld, security, open.

| Track | Pilih? | Bukti di produk |
|---|---|---|
| **`privacy`** | ✅ utama | Sidang Tertutup: bukti E2EE ke model TEE, rekomendasi terverifikasi on-chain (PRIVATE AI, TEE, NEAR AI CLOUD) |
| **`realworld`** | ✅ (saran Dex) | Pembayaran merchant dan payroll yang bisa di-undo: `send_usdc` ke penerima biasa, kontak tepercaya, Barang Diterima, USDC 1:1. Cerita: kas bisnis terlindungi dari invoice palsu. Alamat USDC jadi parameter `new`, bukan hardcode testnet (STABLECOINS; META TRANSACTIONS kalau T1 jadi). Recon: track ini ramai di penagihan freelancer, tapi perlindungan pembayaran masih sepi |
| `nfts` | ❌ | Juri ingin NFT jadi pusat produk, sedangkan di Undo NFT hanya pendukung. Klaim NFT cukup jadi desain di README |
| **`security`** | ✅ (diputuskan 6 Nov) | Function-call key penjaga yang hanya bisa `panic` / `finalize` / `unlock` / `release_expired`, atestasi TEE dicek sebelum tiap sidang, kontrak terkunci (0 key), ancaman A1–A9 sebagai unit test, Coba Curi dengan penjaga Cloudflare (Panik 21 dtk di uji langsung 5 Nov). Hans juga memakai `security`, jadi kabari dia |
| Lainnya | ❌ | — |

Isi `tracks` di payload submission: `["privacy", "realworld", "security"]`.

Grand prize ($55K) tetap terbuka apa pun track-nya. Setiap track yang dipilih harus punya bagian sendiri di README: fitur → file → cara mencoba.

## 8. Arsitektur

| Komponen | Isi | Dasar bukti |
|---|---|---|
| Kontrak `undo-token` v1 (Rust) | L0 + J1–J7 + L1 + verifier L2 level 2 + `send_usdc` + storage deposit (+ kontak kalau T0, NEP-171 kalau T2) | S20 ✅, S22 ✅, S26, S25 |
| Instance "Coba Curi" | Kontrak yang sama, jendela 2 jam, akun demo `coba-curi.<kontrak>.testnet`, kontrak dikunci | S20 ✅ |
| Dewan | Sputnik DAO dengan **≥3 anggota** (anggota tim) | S8 ✅ |
| Server sidang (Node/Next API) | Preflight attestation, susun request kanonik E2EE (kunci klien baru per kasus), ambil tanda tangan, `post_recommendation`. Tidak perlu dipercaya: kalau curang, kontrak menolak | S5a ✅, S21 ✅, S26 |
| Penjaga (Cloudflare Worker cron tiap 1 menit, gratis) + cadangan GitHub Actions cron | Notifikasi berbasis aturan (bot Telegram + banner di aplikasi) untuk semua akun. Untuk Coba Curi: ada transaksi keluar → panik → finalize → buka lagi; setiap bantahan otomatis dibuatkan proposal DAO. Relayer meta-transaction (T1) berjalan di Worker yang sama | S7 ✅, S24, S10 |
| Frontend (Next.js di Vercel Hobby) | Dompet (final vs pending + hitung mundur), Tombol Panik dan Barang Diterima (dari akun pemulihan), kontak tepercaya (kalau T0), Sidang (enkripsi di browser + commit bukti), Dewan, halaman **Janji** (J1–J7 bisa dicek langsung), halaman Bukti (attestation + tanda tangan), dashboard Coba Curi | S12 |

Jaringan: **testnet** untuk semuanya (USDC `usdc.fakes.testnet`). Mainnet tidak wajib.

## 9. Peran (tim 4+)

| Peran | Tanggung jawab |
|---|---|
| **A — Kontrak** (Rust) | Perbaikan J1/J4 dulu, lalu L1 (panik, pemulihan, Barang Diterima), verifier L2 level 2 (S22 ✅ + S26: request kanonik, X25519, prosedur, commit bukti), `get_reserve`/`get_reputation`, build reproducible + penguncian (S25), unit test untuk setiap janji + **tes properti** (urutan aksi acak dari pengirim, pencuri, penerima, dan dewan; J1, J2, dan J6 harus selalu benar) |
| **B — Sidang AI** (TS) | S21 ✅, S26 (vektor + satu panggilan asli), server sidang dengan pembangun request kanonik (byte-nya harus sama persis dengan kontrak), prompt + skema rekomendasi + form bukti terstruktur, kunci banding, `register_tee_signer` lewat DAO, library enkripsi browser (dipakai bersama C) |
| **C — Frontend** (Next.js) | Semua halaman di §8, wallet connect (S12) |
| **D — Produk & submission** | §11 jawaban untuk juri, README "lakukan X → lihat Y" per track, `CLAIMS.md`, video, draf post X dan teks Coba Curi, koordinasi track dengan Hans, payload submission (dikonfirmasi manusia) |
| **E — Penjaga & Coba Curi** | Worker cron + cadangan GitHub Actions, notifikasi Telegram, function-call key khusus `panic`, siklus akun demo, dashboard + uptime, proposal DAO otomatis untuk bantahan; lalu T1 relayer gasless |
| **F — Cerita & tambahan** | Riset angka penipuan online Indonesia (sumber resmi, misalnya OJK/IASC; wajib terverifikasi), perbandingan dengan ERC-20R, tes skenario pembeli nakal dan model ancaman A1–A9, cerita `realworld` (kas bisnis/payroll), desain Klaim NFT di README |

## 10. Jadwal

| Tanggal (UTC) | Fokus | Output |
|---|---|---|
| Sen 2 Nov | S20 + rencana v2 → v3 + S22 + S21 | ✅ S20 lolos (7/7 unit, 19/19 testnet) · ✅ dokumen ini · ✅ S22 lolos (10/10 unit, 8/8 testnet) · ✅ S21 lolos dengan respons asli NEAR AI (on-chain 4/4, biaya $0,0003) · ✅ S26 lolos: sidang level 2 dengan model asli (11/11 unit, 10/10 + 8/8 testnet, 10,7 Tgas, $0,0002) · ✅ **Kontrak v1** (J1–J7, Panik, sidang level 2): 40/40 unit, **35/35 skenario testnet** (`nh-v1undo-mvz2j3bw.testnet`) — 3 hari lebih awal dari jadwal MVP · ✅ tes properti (16.000 langkah acak; J1, J2, J6 selalu benar) · ✅ S25 penguncian (6/6; build reproducible menunggu repo git) · ✅ **web app irisan pertama** (`undo/app`): skenario pencurian dan penipuan + sidang NEAR AI asli + dewan DAO jalan dari browser · ✅ **Coba Curi** ter-deploy dan terkunci; penjaga bereaksi ~33–40 dtk terhadap serangan dengan kunci umpan; dashboard `/coba-curi` (kunci belum dipublikasikan) · ✅ S12 wallet NEAR Connect: tim menghubungkan wallet testnet asli dan menandatangani onboarding; kartu "Uji Tombol Panik" menjalankan latihan pencurian dari satu halaman |
| Sel 3 Nov | **Manusia:** buat repo GitHub (private). **S25**, **S12**. A mulai perbaikan J1/J4 + L1. B mulai server sidang dari `s26_lib.mjs` | — |
| **Rab 4 Nov** | **Gate G1 — ✅ sudah lolos 2 Nov** | S21 + S22 lolos → Sidang Tertutup penuh dengan E2EE. B1 dan B3 tidak diperlukan |
| Kam 5 – Sab 7 Nov | MVP, dengan urutan: kontrak v1 (J1–J7 + L1 Panik + tes A1–A9) → Coba Curi internal → sidang level 2. Paralel: frontend, server sidang, DAO 3 anggota | Skenario A dan B (termasuk pembeli nakal) dari UI |
| Min 8 Nov | **Gate G2**: semua skenario jalan end-to-end di testnet dari UI | Kalau belum, potong sesuai §12 |
| Sen 9 – Sel 10 Nov | Coba Curi + penjaga + notifikasi (wajib), lalu tambahan opsional T1 Panik gasless | Panik otomatis < 2 menit |
| Rab 11 Nov | Feature freeze, deploy final, **kunci kontrak** (hapus full-access key), README + `CLAIMS.md`, tes dari clone bersih, Coba Curi dibuka untuk teman | — |
| Kam 12 Nov | **Gate G3**: video demo | — |
| Jum 13 Nov | Repo publik + post X (oleh manusia) yang mengumumkan Coba Curi | Link repo + link post |
| Sab 14 Nov | Review payload bersama tim, submit ≤ 12:00 UTC | HTTP 201 |
| 16 Nov → | Penjurian; Coba Curi tetap hidup | Angka di dashboard |

**Spike**

| ID | Apa | Butuh |
|---|---|---|
| S5b | ✅ Tercakup oleh S21 (jalur ed25519). Jalur ecdsa tidak dijalankan, untuk menghemat kredit | — |
| S21 ✅ | Satu panggilan E2EE asli → tanda tangan `provider_tee` atas byte **terenkripsi** → kunci model teratestasi di-pin → kontrak memverifikasi dan membuka putusan (4/4 testnet, ~2,4 Tgas, $0,000277). Belum diuji: bukti berupa gambar (Qwen3-VL); kunci banding sudah benar menurut konstruksinya, tapi belum diuji terpisah | — |
| S26 ✅ | **Sidang level 2 di kontrak** (`undo/contracts/s26-court`):<br>- Hasil: 11/11 unit; 10/10 testnet dengan model palsu; **8/8 testnet dengan model NEAR AI asli**.<br>- Biaya: `post_recommendation` lengkap **10,7 Tgas**; wasm 176 KB; panggilan NEAR AI $0,0002.<br>- Ditolak di chain: bukti dibuang, urutan ditukar, rahasia efemeral salah, respons diubah, model membaca pesan selundupan, model membaca prompt lain.<br>- Belum ada: cek pihak dan deadline di `commit_evidence` (masuk kontrak v1) | — |
| S22 ✅ | ed25519 + sha256 + XChaCha20 di kontrak: 10/10 unit, 8/8 testnet. Verify 1,8–4,4 Tgas, open 2–7,3 Tgas, wasm 105 KB (+17 KB untuk dekripsi). Vektor masih buatan sendiri; format asli NEAR AI menunggu S21 | — |
| S25 (sebagian ✅) | ✅ Deploy → hapus full-access key → **0 key**, hash kode di chain = sha256 wasm lokal, deploy ulang mustahil, kontrak tetap jalan (6/6).<br>⏳ `cargo near build reproducible-wasm` belum, karena butuh:<br>(1) repo git dengan semua perubahan sudah di-commit;<br>(2) bagian `[reproducible_build]` di Cargo.toml;<br>(3) Docker yang bisa diakses dari WSL. Docker Desktop sudah terpasang, tapi belum jalan dan integrasi WSL untuk Ubuntu-24.04 belum aktif (diaktifkan **manusia**) | Repo GitHub + Docker Desktop |
| S24 | Worker cron membaca transfer dan memanggil `panic` dengan function-call key | Akun Cloudflare gratis (manusia) |
| S10 ✅ | Meta-transaction NEP-366 + relayer sendiri sudah terbukti di SPIKE_LOG: pembayar tanpa NEAR, gas dibayar relayer. Untuk T1 tinggal dipasang ke `panic` | — |
| S23 | NFT NEP-171 dengan SVG dinamis tampil di wallet testnet (hanya kalau T2 dibangun) | Wallet browser |

## 11. Pertanyaan sulit juri dan jawabannya (bahan pitch, untuk D)

| Pertanyaan | Jawaban |
|---|---|
| "Siapa yang mau menerima uang yang bisa dibatalkan?" | Penjual di marketplace Indonesia sudah terbiasa: uangnya ditahan sampai pembeli mengonfirmasi barang diterima. Undo memberi hal yang sama tanpa marketplace, dan tanpa admin rekber yang bisa kabur. Untuk hubungan yang sudah berjalan (gaji, sewa, pemasok langganan), **kontak tepercaya** membuat pembayaran langsung final |
| "Pembeli nakal bisa terima barang lalu lapor ditipu" | Pelapor wajib memasang bond, yang diberikan ke penjual kalau pelapor kalah. Kekalahan tercatat on-chain dan terlihat oleh semua penerima. Penjual membantah dengan resi. Pembeli yang jujur bisa melepas uang lebih awal lewat Barang Diterima |
| "Hakim AI bisa di-prompt-inject" | AI hanya memberi rekomendasi dan tidak bisa memindahkan uang. Dewan yang memutus. Kalau dewan diam, uang diteruskan ke penerima. Bukti bisa diaudit lewat banding karena hash-nya di-commit |
| "Ini melanggar *code is law*" | Undo justru *code is law*: aturannya dikunci (J1–J7), kontraknya tanpa kunci admin, dan pemakaiannya opt-in, mirip vault dengan timelock. Kuasa manusia hanya memilih A atau B atas uang pending, secara publik |
| "Sudah ada REVERSO, SLOW, Circle Refund, dan Payy Finality" | Betul, dan semuanya ada di slide kami. Mereka membuat transfer bisa dibatalkan atau disengketakan, tapi arbiternya melihat bukti secara terbuka, atau tidak ada sidang sama sekali. Di antara proyek yang kami periksa (termasuk Veridom Pay dan tee-receipts di hackathon ini, yang juga memverifikasi tanda tangan NEAR AI on-chain), belum ada yang buktinya terenkripsi ke enclave, tetap terverifikasi on-chain, dan hanya membuka field putusan. Lihat transaksi `post_recommendation` di explorer |
| "Veridom Pay juga memverifikasi tanda tangan NEAR AI di kontrak" | Betul, bagian itu sama. Bedanya ada di privasi: mereka mempublikasikan berkas request (termasuk foto bukti), sedangkan kami mengenkripsinya ke enclave dan tetap bisa memverifikasi tanda tangannya atas ciphertext |
| "Tanda tangan TEE kan cuma membuktikan proses jalan, bukan putusannya benar" | Betul. Karena itu AI hanya merekomendasikan, dewan yang memutus, dan uang tidak bisa ke pihak ketiga (J1). Yang bisa kami buktikan lebih jauh dari tanda tangan: kontrak memastikan AI membaca prompt resmi, berkas kasus yang benar, dan semua bukti kedua pihak (J7). Penilaian AI tetap bisa salah, dan dewan menjadi jalur bandingnya |
| "Ini kan ERC-20R" (salah satu penulisnya, Dan Boneh, dekat dengan a16z crypto, jadi kemungkinan besar ada juri yang tahu paper ini) | Betul, dan kami menyebutnya. ERC-20R butuh panel hakim untuk setiap kasus. Di Undo, pencurian yang tidak dibantah selesai lewat akun pemulihan tanpa hakim. Sengketa dibaca AI rahasia di TEE dengan tanda tangan yang dicek on-chain, tujuan uang dikunci ke A atau B, dan kami punya implementasi yang jalan di NEAR |
| "Siapa yang memegang rUSDC? Dana pending kan tidak composable" | Penerima tidak perlu memegang rUSDC, karena `send_usdc` mengirim USDC biasa setelah jendela. Yang memakai Undo adalah pemilik uang, sebagai brankas dengan tombol undo. Dana final tetap NEP-141 biasa, dan hanya dana pending yang tidak composable, memang begitu tujuannya. Pemakai pertama: **kas bisnis/payroll** (pembayaran ke rekening baru tertahan, sehingga penipuan invoice palsu bisa dibatalkan, sedangkan karyawan dan pemasok tetap jadi kontak tepercaya) dan **dompet agent AI** (kalau agent dibobol atau terkena prompt injection lalu mengirim uang, pemiliknya menekan Panik) |
| "Coba Curi cuma membuktikan bot kalian hidup" | Betul, dan itu klaim kami: kuncinya bisa dicuri, tapi uangnya tidak bisa dicairkan selama Panik + jendela jalan. Uptime dua penjaga ditampilkan di dashboard. Tanpa penjaga pun, pemilik masih punya 2 jam untuk menekan Panik sendiri |
| "Attestation-nya diverifikasi di kontrak?" | Tidak. Attestation dicek off-chain (siapa saja bisa mengulang di halaman Bukti), lalu kunci model di-pin on-chain. Kontrak memverifikasi setiap tanda tangan terhadap kunci itu |
| "Kenapa TEE, bukan zk?" | NEAR bisa memverifikasi zk-SNARK, tapi membuktikan inferensi LLM dengan zk belum praktis. TEE memberi bukti hardware tentang model yang berjalan, dan tanda tangannya dicek on-chain. Batas kepercayaannya ditulis jujur di CLAIMS.md |
| "Bisa dipakai di mainnet?" | Belum diklaim. Semua jalan di testnet. Daftar "nanti" ada di §13 |

## 12. Prioritas dan urutan potong

- **Urutan kerja (gabungan saran Dex dan review tambahan):**
  1. Spike G1, dijalankan B secara paralel (3–4 Nov), karena murah dan menentukan.
  2. Tombol Panik, dengan model ancaman A1–A9 sebagai tes.
  3. Coba Curi + penjaga + dashboard. Semua ini bisa dibuktikan live.
  4. Sidang Tertutup level 2, satu kasus demo.
  5. Tambahan opsional: T0 kontak tepercaya, lalu T1 Panik gasless.
- **Tidak boleh dipotong:** L0 + J1–J6 + `send_usdc`, L1 panik + finalize otomatis, L2 rekomendasi bertanda tangan TEE yang diverifikasi on-chain, DAO 3 anggota, Coba Curi + penjaga + notifikasi.
- **Urutan potong kalau terlambat di G2:**
  1. Tambahan T0–T2 (kontak tepercaya, Panik gasless, Klaim NFT). Tanpa T0, jawaban "siapa yang mau menerima" tinggal `send_usdc` + Barang Diterima + bond.
  2. Sidang level 2 → level 1: server dipercaya menyusun prompt, dan J7 dicabut dari klaim. Turunan bertahap dulu: X25519 → kunci jadi (lihat §5).
  3. E2EE (ganti B1)
- README dan CLAIMS.md hanya menyebut yang benar-benar jalan. Yang belum jadi ditulis di bagian "Belum jadi".

## 13. Nanti (tidak diklaim di hackathon)

- **Satpam AI:** skor risiko AI di atas notifikasi berbasis aturan.
- **Akun pemulihan multisig** (2-dari-3 wali), untuk menutup A8.
- **Pool jalur instan:** merchant menjual klaim pending untuk dibayar seketika. Butuh model harga risiko yang serius karena rawan *adverse selection*: penipu justru paling suka dana instan.
- *(Sidang level 2 sudah dinaikkan ke inti pada 2 Nov; lihat §3, §4, §5, dan S26.)*
- **Bukti gambar** (Qwen3-VL) di sidang, dengan batas ukuran dan biaya gas yang diukur dulu.
- **zk-SNARK** (usul Hans): verifier Groth16 bisa jalan di NEAR lewat `alt_bn128_pairing_check`. Cocok untuk menyembunyikan nominal transfer atau identitas pelapor. Tidak untuk 12 hari ini.
- **Mainnet** dengan USDC asli dan dewan di luar tim.

## 14. Risiko

| Risiko | Mitigasi |
|---|---|
| E2EE + tanda tangan tidak bisa dihubungkan (S21) | ✅ Terbukti terhubung dengan respons asli. Risiko yang tersisa: NEAR AI mengganti format atau kunci model saat penjurian. Mitigasinya: `register_tee_signer` lewat DAO, dan simpan `s21_raw.json` sebagai bukti |
| Dekripsi di kontrak terlalu berat (S22) | ✅ Terbukti murah (≤ 7,3 Tgas, +17 KB wasm). Risiko yang tersisa ada di format respons asli (S21) |
| Build reproducible butuh Docker (S25) | Publikasikan hash wasm + langkah build; key tetap dihapus |
| Scope masih terlalu besar | Inti dipangkas jadi empat; tambahan hanya setelah G2; urutan potong §12 |
| Chargeback fraud oleh pembeli | Bond + reputasi + bantahan dengan bukti + kontak tepercaya (§11); diuji sebagai skenario |
| Prompt injection di bukti | AI hanya rekomendasi, form terstruktur, `curiga_injeksi`, banding dengan kunci banding, batas nominal |
| Pencuri melewati jendela dengan "Barang Diterima" | Hanya akun pemulihan yang bisa melepas lebih awal |
| Pencuri mengganti akun pemulihan, atau memasangnya di akun yang belum punya | Pemasangan instan hanya untuk akun kosong; selain itu lewat jeda, bisa dibatalkan, dan dibekukan saat panik |
| Pencuri menambahkan dirinya sebagai kontak tepercaya | Jeda 48 jam; panik membatalkan; notifikasi |
| Akun pemulihan dicuri, atau kedua kunci dicuri | Model ancaman A7–A8 (§4): uang menuju akun pemulihan bisa dibantah pemilik; kalau kedua kunci dicuri, itu di luar cakupan dan ditulis jujur |
| Dewan lalai sampai `dispute_timeout` | ✅ Ditutup di v1. Kalau dewan diam, keadaan yang dibantah tetap berlaku, jadi bantahan pencuri atas Panik tidak menang karena kelalaian (J3, tes `j3_council_silence_after_a_contested_panic_keeps_the_panic`). Untuk laporan penipuan, diamnya dewan meneruskan uang ke penerima, sesuai tujuannya. Penjaga tetap membuatkan proposal DAO untuk setiap sengketa |
| Bug ditemukan setelah kontrak dikunci | Kunci hanya di deploy final (11 Nov); semua janji punya unit test; Coba Curi memakai instance terpisah, jadi bug yang ditemukan di sana jadi bahan cerita, bukan kehilangan uang asli |
| Coba Curi diserang spam | Storage dibayar pengirim; instance terpisah; testnet saja |
| Juri AI memeriksa klaim | `CLAIMS.md` (klaim → file:baris → tes), batas kepercayaan ditulis jujur |
| Juri menganggap Undo turunan dari ERC-20R, REVERSO, SLOW, Circle Refund, atau Payy Finality | Prior art disebut di pitch, README, dan video, lengkap dengan tabel perbedaannya (§2). Kebaruan yang diklaim hanya satu: sidang privat yang terbukti on-chain. J1 disebut sebagai ide Circle Refund |
| Sidang level 2 lebih sulit atau lebih mahal dari perkiraan (X25519 di wasm, format request) | ✅ S26 terbukti dengan model asli (10,7 Tgas). Risiko yang tersisa: kontrak produk lebih kompleks dari spike (cek pihak + deadline commit). Cadangan level 1 tetap ada (§12) |
| Byte request yang dibangun server dan kontrak berbeda satu karakter saja | Satu fungsi pembangun yang sama dites di kedua sisi dengan vektor bersama; tes negatif untuk setiap field |
| Dewan = anggota tim (terpusat selama hackathon) | Ditulis jujur di CLAIMS.md. Kuasanya dibatasi J1–J3, dan semua putusan publik. Nanti: dewan di luar tim |
| Penjaga Coba Curi mati, lalu uang lolos | Dua penjaga independen, jendela 2 jam, dan uptime di dashboard. Kalau lolos juga, itu ditulis jujur sebagai temuan |
| Kata "stablecoin" menyesatkan | Pakai "wrapped USDC" di semua materi |

## 15. Biaya

Target Rp0: semua di testnet, kredit NEAR AI $10 gratis (terukur di S21: $0,000277 per rekomendasi dengan `z-ai/glm-5.3-flash`; pakai hemat, satu panggilan per uji), Cloudflare Workers free, bot Telegram gratis, Vercel Hobby gratis.
