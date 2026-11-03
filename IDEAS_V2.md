# IDEAS V2 — ide baru setelah riset 2 Nov 2026

Dasar: [recon/05_judges_x.md](recon/05_judges_x.md) (juri), [recon/06_competition_live.md](recon/06_competition_live.md) (pesaing, 213 repo), [recon/07_new_primitives.md](recon/07_new_primitives.md) (fitur baru NEAR), [recon/08_winner_patterns.md](recon/08_winner_patterns.md) (pola pemenang). Bukti teknis: [SPIKE_LOG.md](SPIKE_LOG.md). Aturan skor sama dengan [IDEAS.md](IDEAS.md).

## Temuan riset yang mengubah keputusan

1. **Semua 7 juri** membahas gelombang hack di Oktober (Binance ~$6B pada 29 Okt, NEAR Intents ~$3,8M pada 1 Okt) dan cara bertahan darinya.
   - Haseeb mengusulkan "cryptographic recovery mode" di level chain ([x.com/hosseeb/status/2108234053023645777](https://x.com/hosseeb/status/2108234053023645777), 8 Okt).
   - Illia: "turn judgement into code via verifiable AI", dengan contoh AI teratestasi yang memutuskan apakah dana hasil curian ([x.com/ilblackdragon/status/2104785986307907781](https://x.com/ilblackdragon/status/2104785986307907781), 29 Sep).
   - Avichal ikut menulis Electric Capital Opportunity #14: aset DeFi yang bisa dibalikkan oleh komite setelah hack.
2. **Lane yang penuh:**
   - Vault "leash" (batas belanja agent): ±30 klon.
   - x402 paywall dan escrow kerja agent yang diputuskan juri.
   - Invoice freelancer, OTC privat, dan pet AI (Kibble sudah di mainnet).
   - Sudah ada 45 submission final pada hari ke-2.
3. **Lane yang kosong:**
   - Event escrow gaya Kickback.
   - Social di atas Sputnik/Trezu.
   - NFT yang punya dompet sendiri.
   - DeFi di luar swap.
   - Token yang bisa di-undo: 0 repo (dicek ulang via GitHub search, 2 Nov).
4. **Kabar baik:**
   - Kredit NEAR AI **$10 gratis** dengan bergabung ke NEAR Builders (nearbuilders.org/join; Q-000 di HACKATHON.md). S5b tidak lagi butuh uang.
   - Kode sejak 19 Okt boleh dipakai sebagai baseline (Q-001), jadi skrip spike tidak perlu ditulis ulang.
5. **Hal yang perlu diwaspadai:**
   - Mainnet upgrade 86 → 88 sekitar 7 Nov. Semua tes di mainnet diulang setelah itu.
   - Mert anti "AI dekoratif" dan teks hasil AI.
   - Juri AI memeriksa setiap klaim README terhadap kode, jadi jangan berlebihan klaim. Buat `CLAIMS.md`.

## Skor

F = Feasibility, U = Uniqueness, D = Demo Power, J = Judge Fit, R = Real-World Value, B = Business Viability.

| # | Ide | Track | F | U | D | J | R | B | Total |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Undo — "Ctrl+Z untuk stablecoin"** | defi, security, open | 7 | 9 | 8 | 9 | 7 | 6 | **46** |
| 2 | **Rekber AI** — rekening bersama tanpa makelar | realworld, social | 7 | 6 | 8 | 8 | 8 | 7 | **44** |
| 3 | **Anti Jam Karet** — event escrow (Kickback lintas-chain) | social, realworld | 9 | 6 | 8 | 7 | 8 | 6 | **44** |
| 4 | **Pasar Pendapat** — opinion market (peringkat berbobot stake) | social, memecoins | 8 | 8 | 7 | 7 | 6 | 6 | **42** |
| 5 | **Bonded Calls** — "call" KOL wajib bertaruhan | social, nfts, memecoins | 8 | 7 | 7 | 6 | 7 | 6 | **41** |

Cadangan: Rain Bond (asuransi hujan untuk ojol, 41), Vault Card (40, atau ≈42 jika S15 lolos; lane NFT-berdompet masih kosong).

---

## 1. Undo — "Ctrl+Z untuk stablecoin" (rekomendasi)

**One-liner:** stablecoin pembungkus (`rUSDC`) yang setiap transfernya punya jendela undo. Kalau terbukti curian, dana dikembalikan ke korban sebelum pencuri bisa menariknya.

**Masalah:** setelah hack, uang langsung hilang. "Code is law" tidak punya tombol undo. Ini kejadian nyata di bulan yang sama dengan penjurian (Binance, NEAR Intents).

**Mekanisme (rencana):**
1. **Wrap:** USDC → `rUSDC` (1:1, instan).
2. **Transfer:** saldo penerima berstatus *pending* selama jendela T (produksi misalnya 24 jam; demo 3 menit), lalu otomatis *final*. Unwrap ke USDC hanya dari saldo final.
3. **Lapor:** korban atau watcher memanggil `report_theft` dengan bond kecil. Dana pending di jalur yang dilaporkan dibekukan.
4. **Putusan:** model NEAR AI di TEE membaca bukti dan memberi putusan bertanda tangan, yang hash-nya dicatat. **Dewan Sputnik DAO** memberi keputusan akhir di dalam jendela. Jika disetujui, dana pending kembali ke korban dan bond pelapor dikembalikan. Laporan palsu kehilangan bond.
5. **Jalur instan:** merchant yang tidak mau menunggu bisa menerima dana final seketika dari pool LP dengan fee kecil. LP menanggung risiko undo dan mendapat fee.

**Pertanyaan Eddy dan jawaban kita:**
- *Dewan bisa sewenang-wenang?* Kuasanya hanya atas dana pending di dalam jendela. Setiap keputusan publik, ada putusan AI teratestasi, dan token ini opt-in.
- *Pencuri langsung unwrap?* Unwrap hanya dari saldo final, jadi itu yang ditunggu jendela.
- *UX lambat?* Ada jalur instan via LP, dan jendela diskalakan menurut nominal.

**Komponen dan bukti:**
- NEP-141 sendiri (S13 ✅), USDC testnet (S14 ✅), Sputnik DAO (S8 ✅), gasless (S10 ✅).
- Putusan AI: S5b, gratis dengan kredit $10. AI bersifat *pendukung*; dewan tetap bisa memutuskan tanpa AI.
- Stretch: deteksi otomatis aliran dari alamat hack di chain lain via `verify_foreign_transaction` (07).

**Demo 3 menit:**
1. Simulasi pencurian `rUSDC` di testnet (akun milik tim sendiri).
2. Korban lapor, AI memberi putusan, dewan voting, dana kembali.
3. Pencuri mencoba unwrap dan ditolak.
4. Merchant menerima pembayaran instan lewat LP.

**Juri:** Haseeb (recovery mode), Avichal (EC #14), Illia (judgement into code, SHIELD), Eddy (desain mekanisme, AI favors defenders), Kain (keamanan DeFi).

**Kelemahan:**
- Butuh kontrak kustom yang lebih kompleks dari spike.
- Debat "kripto kok bisa di-undo" pasti muncul. Itu bagus untuk pitch, tapi argumennya harus rapi.
- Adopsi butuh merchant atau aplikasi yang mau memakai `rUSDC`.

**Bisnis:** fee jalur instan + fee asuransi kecil per transfer.

## 2. Rekber AI — rekening bersama tanpa makelar

**One-liner:** escrow untuk jual-beli online P2P (gaya rekber Kaskus/Facebook). Dana ditahan kontrak. Kalau ada sengketa, AI di TEE membaca bukti (chat, foto resi) dan memberi putusan teratestasi, dengan banding ke panel DAO.

- **Kenapa:** rekber dipakai luas di Indonesia, tapi makelarnya sendiri bisa kabur. Beberapa aplikasi rekber non-kripto sedang dibangun (GitHub, Okt 2026), jadi pasarnya nyata.
- **Risiko:** mirip dengan "escrow kerja agent yang diputuskan juri" (6 repo di track agents). Pembedanya: perdagangan antar-manusia di Indonesia.
- **Catatan:** mekanismenya satu keluarga dengan Undo, jadi bisa menjadi **aplikasi pertama di atas Undo** (stretch).

## 3. Anti Jam Karet — event escrow

**One-liner:** daftar acara dengan setoran. Yang datang tepat waktu mendapat bagian dari setoran yang telat atau tidak datang. Check-in lewat QR dengan kunci terbatas di HP panitia.

- **Kenapa:** 0 pesaing, ada di daftar Illia, semua komponen sudah ✅, dan tim bisa menguji di acara kampus sungguhan (angka nyata untuk juri).
- **Risiko:** konsepnya sudah dikenal (Kickback). Peluang grand prize lebih kecil, peluang juara track lebih besar.

## 4. Pasar Pendapat — opinion market

**One-liner:** pasang stake pada peringkat subjektif ("sambal terbaik di Bandung"). Suara disembunyikan (commit-reveal) sampai ditutup, dan yang paling dekat ke konsensus berbobot stake mendapat hadiah.

- **Kenapa:** EC #16, belum ada produknya, dan ini murni desain mekanisme (Eddy).
- **Risiko:** terlihat seperti taruhan. Demo memakai poin atau testnet, dan perlu hati-hati soal aturan judi di Indonesia.

## 5. Bonded Calls — call KOL wajib bertaruhan

**One-liner:** setiap call token atau klaim KOL wajib dijaminkan. Kalau call gagal (dicek oracle harga), jaminannya dibagikan ke follower. Rekam jejak KOL disimpan di NFT yang tidak bisa dipindah.

- **Kenapa:** tesis a16z "staked media", dan pas dengan masalah penipuan KOL di Indonesia.
- **Risiko:** butuh KOL sungguhan yang mau ikut.

---

## Rekomendasi

🥇 **Undo (46).** Ini primitive baru, bukan sekadar fitur. Timing-nya tepat dan langsung menjawab tesis 4–5 juri. Bagian NEAR-nya menanggung beban (Sputnik DAO + putusan AI teratestasi + kontrak), dan belum ada pesaing.

**Gate:** 4 Nov. Kontrak transfer pending + undo lewat DAO harus jalan di testnet. Kalau tidak, pindah ke 🥈.

🥈 **Anti Jam Karet (44).** Paling aman: semua komponen sudah terbukti dan pesaingnya nol.

Keputusan dibuat **hari ini (2 Nov)**. Setiap hari tertunda = 1/14 waktu build.
