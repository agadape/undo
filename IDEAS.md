# IDEAS — NEAR HACKATHON (Phase 3, 2026-10-28)

Semua ide di bawah dibangun **hanya** di atas kemampuan yang sudah terbukti di [SPIKE_LOG.md](SPIKE_LOG.md). Referensi `S#` = baris spike. Konteks: [recon/00_SYNTHESIS.md](recon/00_SYNTHESIS.md).

Aturan skor (playbook): Feasibility dibatasi maks **5** kalau ada dependensi inti yang belum di-spike; Judge Fit maks **5** tanpa juri bernama + bukti; Business maks **4** tanpa model bisnis satu kalimat.

Status kemampuan yang dipakai:
- ✅ terbukti: S7 (function-call key, sub-account, revoke, gas key*), S8 (Sputnik DAO), S9 (OutLayer), S10 (meta-tx gasless), S13 (kontrak FT/NFT/MT sendiri), S14 (USDC testnet + DAO bayar USDC), S5a (atestasi NEAR AI), S6a (quote 1Click), S6c (intent ditandatangani — termasuk oleh MPC — diterima verifier mainnet)
- ⚠️ sebagian: S4 (Chain Signatures: tanda tangan ✅, broadcast belum karena faucet), S6 (eksekusi Intents nyata butuh wallet mainnet berdana)
- ❌ belum: S5b (inferensi NEAR AI — butuh API key), S11 (social login), S12 (wallet connect browser)

\* gas key hanya di testnet (protokol 88); mainnet masih 86.

---

## Ide 1: Vault Card — NFT yang memiliki akun NEAR Intents
**Track**: `nfts` (juga `defi`, `open`)
**One-liner**: Setiap NFT punya dompet lintas-chain sendiri di NEAR Intents; siapa pun yang memegang NFT-nya, dialah yang mengendalikan isinya — jual NFT = jual dompet beserta saldonya.
**Real problem**: Memindahkan "posisi" kripto (saldo multi-chain, hadiah, warisan, alokasi OTC) ke orang lain berarti membagikan private key atau melakukan banyak transfer per chain. Tidak ada cara aman untuk memperjualbelikan sebuah dompet utuh.
**Built on**: S13 ✅ (NFT NEP-171), S6c ✅ (intent ERC-191 yang ditandatangani MPC diterima `intents.near` mainnet), S4 ✅/⚠️ (derivasi alamat + tanda tangan MPC), S6a ✅ (quote 1Click untuk deposit dari chain lain). **Belum di-spike**: kontrak NFT yang memanggil `v1.signer.sign` sendiri (path = token_id) → perlu spike S15 (±1–2 jam).
**Grounding**: prompt track nfts "Build NFTs as accounts — assets that own money…" + hint SUB-ACCOUNTS (HACKATHON.md); gap recon 03: "No token-bound-account equivalent where an NFT controls a sub-account or Chain Signatures wallet" (crowding **Low**); kejutan spike S6c.

### Devil's Advocate
- Siapa yang butuh menjual dompet? Pasarnya bisa niche (trader OTC, kolektor).
- Risiko mekanisme: penjual bisa menguras vault tepat sebelum NFT berpindah → perlu "lock" selama listing / escrow. Eddy Lazzarin akan menyerang celah ini.
- Teknis: panggilan kontrak → MPC (yield/resume, ~6 s, 300 TGas) belum dibuktikan dari kontrak; demo end-to-end butuh sedikit dana mainnet untuk Intents.

### Defense
- Primitive yang dipakai dalam-dalam persis yang didorong NEAR sekarang: Chain Signatures + Intents, tanpa private key di mana pun.
- Belum ada di NEAR (track sepi), dan S6c membuktikan bagian tersulit (verifier mainnet menerima tanda tangan MPC).
- Lock/escrow saat listing adalah mekanisme sederhana yang justru jadi poin cerita "desain yang aman".

### Winnability Score
| Dimensi | Skor | Alasan |
|---|---|---|
| Feasibility | 5 | Dibatasi: kontrak→MPC belum di-spike. Jika S15 lolos → realistis 7 (inti ✅, eksekusi Intents ⚠️ butuh dana kecil) |
| Uniqueness | 9 | Token-bound Intents account belum ada di NEAR; kombinasi NFT + MPC + Intents baru |
| Demo Power | 8 | Mint kartu → isi saldo → transfer NFT → pemilik baru menarik dana di chain lain; jejak tx terlihat |
| Judge Fit | 7 | Illia: fokus publik Intents + Chain Signatures + confidential compute (recon 01); Mert: "no world… markets gatekept exclusively through CEXes" (near.org, 14 Okt 2026) → pasar terbuka untuk posisi |
| Real-World Value | 6 | Gift card lintas-chain, warisan, transfer posisi OTC, kartu anggota yang memegang kas — nyata tapi niche |
| Business Viability | 6 | "Fee 0,5% setiap Vault Card terjual di marketplace bawaan, plus fee mint kecil." Tidak butuh likuiditas sendiri |
| **Total** | **41/60** | (≈43 jika S15 lolos) |

---

## Ide 2: Arisan DAO — arisan tanpa bendahara kabur
**Track**: `social` (juga `realworld`)
**One-liner**: Grup arisan berjalan di Sputnik DAO: anggota setor USDC tanpa perlu punya NEAR (gasless), pemenang tiap putaran diundi transparan, dan kas otomatis membayar pemenang lewat proposal DAO.
**Real problem**: Arisan bergantung pada satu bendahara yang dipercaya; kasus uang arisan dibawa kabur / pencatatan berantakan sering terjadi. Anggota juga butuh bukti setoran yang tidak bisa diubah.
**Built on**: S8 ✅ (create DAO, proposal, approve), S14 ✅ (DAO memegang dan membayar USDC; danai DAO dengan `ft_transfer` biasa), S10 ✅ (anggota tanpa NEAR bisa bayar USDC gasless), S13 ✅ (NFT kredensial anggota/reputasi). Undian: `env::random_seed` di kontrak kecil atau OutLayer VRF (S9 ✅ untuk eksekusi, varian VRF belum) — fallback: undian lewat voting DAO, jadi inti tidak bergantung padanya.
**Grounding**: prompt track social "shared budgets, programmable rewards, collective ownership… on top of Sputnik DAO and Trezu. Don't rebuild the multisig — build what communities do with it"; gap recon 03: "Consumer shared budgets… access gated by Nada.bot or veNEAR" (crowding Low-medium); tim berbasis Indonesia = pengguna yang bisa dijangkau langsung.

### Devil's Advocate
- Masalah klasik ROSCA: anggota yang sudah menang berhenti setor. On-chain tidak otomatis menyelesaikan ini.
- Anggota harus punya USDC → butuh on-ramp rupiah (belum di-spike, di luar scope hackathon).
- Juri bisa melihatnya sebagai "aplikasi multisig biasa" dan narasi AI/Intents tipis.

### Defense
- Justru ini "what communities do with it" yang diminta track — bukan multisig baru.
- Mekanisme anti-gagal-bayar bisa ditunjukkan: jaminan kecil di DAO + NFT reputasi (anggota yang tepat waktu dapat urutan undian lebih baik) — desain mekanisme yang bisa dibahas juri.
- Pengguna nyata dan bisa diuji langsung oleh tim (bisa tunjukkan metrik grup arisan sungguhan saat demo — pola pemenang "angka nyata").

### Winnability Score
| Dimensi | Skor | Alasan |
|---|---|---|
| Feasibility | 8 | Loop inti (setor gasless → DAO → bayar pemenang) semuanya ✅ (S8, S10, S14); undian acak opsional |
| Uniqueness | 7 | ROSCA on-chain pernah ada di ekosistem lain; di NEAR dan dengan Sputnik + gasless belum ada |
| Demo Power | 7 | 5 anggota, setor dari HP tanpa NEAR, undian live, tx pembayaran muncul — jelas tanpa penjelasan |
| Judge Fit | 5 | Tidak ada juri bernama yang secara publik mendukung ruang ini (dibatasi aturan) |
| Real-World Value | 8 | Arisan sangat umum di Indonesia; tim bisa merekrut grup nyata untuk uji coba |
| Business Viability | 6 | "Fee 1% dari pot setiap putaran." Tanpa kebutuhan likuiditas |
| **Total** | **41/60** | |

---

## Ide 3: Tagih — invoice USDC yang bisa dibayar tanpa punya kripto gas
**Track**: `realworld` (juga `business`)
**One-liner**: Freelancer/UMKM kirim link invoice; klien membayar USDC tanpa perlu NEAR untuk gas, status otomatis "lunas", dan semua pembayaran bisa diekspor ke CSV akuntansi.
**Real problem**: Freelancer yang dibayar stablecoin harus mengejar konfirmasi manual, mencocokkan transfer ke invoice, dan klien sering terhambat karena tidak punya token gas.
**Built on**: S10 ✅ (meta-tx: pembayar 0 NEAR), S14 ✅ (USDC NEP-141, memo pada `ft_transfer`), S13 ✅ (kontrak invoice sendiri bila perlu), S6a ✅ (quote 1Click untuk bayar dari chain lain; eksekusinya ⚠️ — opsional, bukan inti).
**Grounding**: prompt track realworld "payroll, invoicing, remittances, merchant payments… Something a normal company could use tomorrow" + hint META TRANSACTIONS; gap recon 03: "Invoicing or accounts receivable with accounting export… gasless stablecoin UX via meta-tx" (crowding Medium).

### Devil's Advocate
- Sudah ada PingPay checkout dan HOT Pay sedang dibangun; Request Network di ekosistem lain.
- Demo "bayar invoice" kurang dramatis.
- Tidak ada juri yang jelas memperjuangkan invoicing.

### Defense
- Fokus sempit yang belum ada: AR (piutang) + ekspor akuntansi + gasless + "bayar dari chain mana pun" lewat 1Click.
- Paling dekat ke "dipakai perusahaan normal besok"; model bisnis paling jelas.

### Winnability Score
| Dimensi | Skor | Alasan |
|---|---|---|
| Feasibility | 8 | Inti ✅ (S10, S14); bayar lintas-chain opsional ⚠️ |
| Uniqueness | 5 | Checkout/invoice stablecoin sudah ada di NEAR (PingPay) dan di luar NEAR |
| Demo Power | 6 | Jelas tapi kurang "wow" |
| Judge Fit | 5 | Tanpa juri bernama yang mendukung ruang ini |
| Real-World Value | 8 | Freelancer dan UMKM yang menerima stablecoin itu nyata |
| Business Viability | 8 | "Fee 0,5% per invoice yang terbayar." Nol kebutuhan likuiditas |
| **Total** | **40/60** | |

---

## Ide 4: Pasar Malam — game dagang dengan NPC pedagang yang punya dompet sendiri
**Track**: `games`
**One-liner**: Game dagang ringan di browser: NPC pedagang adalah agent dengan dompet berbatas (function-call/gas key) yang menyetok, menawar, dan menetapkan harga item NEP-245 sesuai permintaan pemain — pemain bermain tanpa tahu ada blockchain.
**Real problem**: Ekonomi game biasanya statis dan diatur developer; track meminta "economies that evolve without a dev patch".
**Built on**: S13 ✅ (multi-token NEP-245 + batch transfer), S10 ✅ (pemain gasless), S7 ✅ (NPC dengan key yang hanya bisa memanggil method dagang + allowance; gas key ⚠️ testnet), S3 ✅ (backend membuat akun pemain otomatis tanpa social login). Dialog AI NPC: NEAR AI (S5b ❌) — opsional.
**Grounding**: prompt track games "NPCs with wallets, player-owned markets… bonus if players never notice the chain" + hint NEP-245, AGENT NPCS; gap recon 03: "No real game loop with wallet-holding NPCs, NEP-245 player markets" (crowding **Low**).

### Devil's Advocate
- Dinilai dari game loop: membuat game yang benar-benar seru dalam 14 hari itu berat.
- Kalau NPC tidak pakai AI, "agent" terasa seperti script biasa.
- Nilai setelah hackathon rendah (mainan).

### Defense
- Track paling sepi; tim 4+ orang bisa bagi peran (game, kontrak, backend, art).
- Semua bagian on-chain yang dibutuhkan sudah ✅.

### Winnability Score
| Dimensi | Skor | Alasan |
|---|---|---|
| Feasibility | 5 | Bagian chain ✅, tapi scope game + polish besar untuk 14 hari |
| Uniqueness | 8 | Belum ada game loop dengan NPC ber-dompet di NEAR |
| Demo Power | 8 | Visual dan interaktif |
| Judge Fit | 5 | Tidak ada juri bernama yang fokus ke games |
| Real-World Value | 4 | Kemungkinan besar mainan hackathon |
| Business Viability | 5 | "Fee 2% pada setiap transaksi item di pasar." |
| **Total** | **35/60** | |

---

## Ide 5: Uang Saku Agent — anggaran AI agent yang dikunci protokol dan disetujui DAO
**Track**: `security` (juga `agents`, `business`)
**One-liner**: Beri AI agent "uang saku" berupa key yang hanya bisa memanggil method tertentu dengan batas biaya, diisi ulang lewat proposal DAO, dan bisa dicabut seketika.
**Real problem**: "Give AI money without giving it the keys to everything" — agent sekarang biasanya memegang private key penuh.
**Built on**: S7 ✅ 10/10 (whitelist method, allowance, revoke instan, gas key), S8 ✅ (top-up lewat proposal DAO), S14 ✅ (anggaran dalam USDC), S6c ✅ (agent bertransaksi di Intents lewat MPC tanpa key).
**Grounding**: prompt track security + hint FUNCTION CALL KEYS; Haseeb Qureshi, "Crypto was not made for humans" (18 Feb 2026) — "self-driving wallets".

### Devil's Advocate
- Track paling ramai: spend-limit wallet sudah banyak (near-agent-guard, nearvault, agent-sentinel, OutLayer custody).
- Gas key belum ada di mainnet.

### Defense
- Sepenuhnya terbukti; pembedanya gas key + DAO sebagai "orang tua" yang menyetujui anggaran.

### Winnability Score
| Dimensi | Skor | Alasan |
|---|---|---|
| Feasibility | 9 | Semua inti ✅ |
| Uniqueness | 5 | Ruang paling ramai |
| Demo Power | 6 | Penolakan transaksi oleh protokol itu meyakinkan tapi kering |
| Judge Fit | 7 | Haseeb: "When agents can discover other agents and enter into economic agreements autonomously, they will prefer crypto" (haseebq.com) |
| Real-World Value | 6 | Pengguna = developer agent |
| Business Viability | 6 | "Langganan bulanan per agent yang dikelola." |
| **Total** | **39/60** | |

---

## Ranking

| # | Ide | Track | Total | Catatan |
|---|---|---|---|---|
| 1 | Vault Card | nfts | 41 (≈43 setelah S15) | Paling unik, paling pas narasi NEAR; butuh 1 spike lagi |
| 2 | Arisan DAO | social | 41 | Inti 100% terbukti; pengguna nyata di Indonesia; judge fit lemah |
| 3 | Tagih | realworld | 40 | Model bisnis paling jelas; kurang unik |
| 4 | Uang Saku Agent | security | 39 | Paling mudah dibangun; track paling ramai |
| 5 | Pasar Malam | games | 35 | Track paling sepi; risiko scope terbesar |

Diskualifikasi: tidak ada (tidak ada blockchain dekoratif; semua punya model bisnis; tidak ada Feasibility < 5).

## Rekomendasi

🥇 **Vault Card — 41/60 (≈43 jika S15 lolos)**
Paling kuat karena memakai dua primitive yang sedang didorong NEAR (Chain Signatures + Intents) secara dalam, di track yang hampir kosong, dan bagian tersulitnya sudah terbukti di verifier mainnet (S6c). Main risk: kontrak NFT memanggil MPC sendiri belum dibuktikan → jalankan **S15** sebelum 1 Nov (±1–2 jam); kalau gagal, pindah ke 🥈.

🥈 **Arisan DAO — 41/60**
Pilihan aman jika S15 gagal atau tim ingin produk dengan pengguna nyata: semua dependensi inti sudah ✅ dan tim punya akses langsung ke pengguna. Bisa diperkuat dengan Vault Card kecil (kas arisan sebagai NFT) kalau S15 lolos.

Update 28 Okt: daftar ide proyek dari Illia sudah dibaca dan dipetakan di [recon/04_illia_ideas.md](recon/04_illia_ideas.md). Kandidat teratas baru: registrasi event ber-escrow (43) dan AI Tamagotchi (41, ≈43 jika S5b lolos).
