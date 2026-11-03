# Rencana Kerja — Vault Card (NEAR HACKATHON, 1–14 Nov 2026)

Dokumen perencanaan saja — **tidak ada kode produk sebelum 1 Nov 00:00 UTC** (aturan situs: "Build your project during the hackathon"). Dasar teknis: [SPIKE_LOG.md](SPIKE_LOG.md), ide: [IDEAS.md](IDEAS.md).

Waktu: semua tanggal dalam UTC. WIB = UTC+7 → kickoff **Minggu 1 Nov 07:00 WIB**, deadline **Sabtu 14 Nov 23:59 UTC = Minggu 15 Nov 06:59 WIB**. Target submit: **14 Nov 12:00 UTC** (ada buffer 12 jam).

---

## 1. Produk dalam satu kalimat

Setiap Vault Card (NFT NEP-171) mengendalikan satu akun NEAR Intents lewat Chain Signatures; hanya pemegang NFT yang bisa meminta kontrak menandatangani intent untuk akun itu — jadi memindahkan NFT = memindahkan dompet beserta saldonya, tanpa private key di mana pun.

## 2. Scope

### MVP (wajib ada di demo)
1. **Mint** Vault Card → UI langsung menampilkan alamat vault (alamat EVM hasil derivasi MPC dari `kontrak + token_id`, dihitung di klien seperti S4).
2. **Isi vault**: deposit token (USDC/wNEAR) ke akun Intents milik alamat vault.
3. **Pakai vault**: pemilik NFT memindahkan dana dari vault (intent `transfer`/`ft_withdraw`) — kontrak mengecek pemilik, lalu memanggil MPC `sign` (ERC-191), relayer mengirim `execute_intents`.
4. **Momen "wow"**: NFT dipindah ke orang lain → pemilik lama ditolak, pemilik baru berhasil menarik dana.
5. **Listing lock**: saat Vault Card dijual/di-list, vault terkunci agar penjual tidak bisa menguras isinya sebelum serah terima (jawaban untuk pertanyaan desain mekanisme dari juri).

### Stretch (hanya setelah MVP jalan end-to-end)
- Marketplace bawaan: jual Vault Card dalam USDC (NEP-178 approval + `ft_transfer_call`), fee 0,5%.
- Tarik dana ke chain lain (mis. USDC di Base) lewat withdraw Intents / 1Click.
- Pembeli tanpa NEAR: meta-tx gasless (S10) untuk beli/klaim.
- AI agent sebagai pemegang Vault Card (agent pegang dana tanpa key; NEAR AI hanya jika S5b sudah lolos).

### Di luar scope
- Token/airdrop sendiri, mobile app, dukungan banyak chain sekaligus di UI.

## 3. Arsitektur (rencana, belum kode)

| Komponen | Isi | Dasar bukti |
|---|---|---|
| Kontrak `vault-card` (Rust, near-sdk 5.29.1 + near-sdk-contract-tools 4.0.0) | NFT NEP-171/177/178/181; `vault_sign(token_id, payload)` → cek pemilik + tidak terkunci → panggil `v1.signer.sign` (path `vault/<token_id>`, domain 0) → kembalikan tanda tangan; `list`/`unlist`/lock | S13 ✅, S4 ✅ (tanda tangan), **S15 (belum)** |
| Payload builder (TypeScript) | JSON ERC-191 (`signer_id` lowercase, `verifying_contract: intents.near`, deadline, **versioned nonce** dengan salt terkini), konversi tanda tangan MPC → `secp256k1:` base58(r‖s‖v) | S6c ✅ |
| Relayer (Node) | `simulate_intents` dulu, lalu `execute_intents` di mainnet; bayar gas | S6c ✅ (simulasi), eksekusi **S17 (belum)** |
| Deposit | `ft_transfer_call` ke `intents.near` dengan penerima = alamat vault, atau quote 1Click `recipientType: INTENTS` | S6a ✅ (quote), **S16 (belum)** |
| Frontend (Next.js) | Halaman mint, halaman vault (alamat, saldo `mt_balance_of`), transfer, withdraw, list/lock | wallet connect **S12 (belum)** |

Jaringan: pengembangan pakai MPC testnet + `simulate_intents` mainnet (sudah terbukti bisa digabung di S6c). **Demo final di mainnet** (kontrak di mainnet + `v1.signer`), dengan nominal kecil.

## 4. Pembagian peran (tim 4+)

| Peran | Tanggung jawab | Spike yang dipegang |
|---|---|---|
| **A — Kontrak** (Rust) | Kontrak `vault-card`, lock/listing, unit test, deploy testnet & mainnet | S15 |
| **B — Integrasi Intents/MPC** (TS) | Payload builder, nonce, relayer, deposit/withdraw, simulate → execute | S16, S17 |
| **C — Frontend** (Next.js) | Semua layar, wallet connect, tampilan alamat & saldo vault | S12 |
| **D — Produk & submission** | README untuk juri AI ("lakukan X → lihat Y"), skrip demo, video, draf post X, payload submission, QA dengan wallet baru | — |
| **E/F — (jika ada)** | Marketplace USDC + stretch (cross-chain withdraw, AI agent holder) | — |

Aturan kerja: setiap integrasi baru di-spike dulu (≤45 menit, catat di SPIKE_LOG) sebelum dipakai di kode produk. Langkah yang memindahkan uang sungguhan di mainnet dijalankan oleh anggota tim (bukan AI).

## 5. Jadwal harian

| Hari | Tanggal (UTC) | Fokus | Output akhir hari |
|---|---|---|---|
| 1 | Min 1 Nov | Buat repo produk (commit pertama ≥ 1 Nov). **S15** (kontrak → MPC sign, path = token_id, hasil dipakai di `simulate_intents`), **S12** (wallet connect), siapkan S16 | S15 + S12 tercatat di SPIKE_LOG |
| 2 | Sen 2 Nov | **S16** (deposit ke Intents untuk alamat vault, nominal kecil, dijalankan manusia) + **S17** (`execute_intents` transfer kecil). Freeze arsitektur | **Gate G1** (lihat §6) |
| 3 | Sel 3 Nov | A: NFT + `vault_sign` dengan cek pemilik. B: payload builder + relayer (simulate). C: halaman mint + alamat vault | Mint di testnet, alamat vault tampil |
| 4 | Rab 4 Nov | A: lock/listing. B: alur deposit. C: halaman vault + saldo | Deposit → saldo terlihat di UI |
| 5 | Kam 5 Nov | Integrasi pertama end-to-end (testnet MPC → simulate mainnet) | Pemilik bisa "memindahkan" dana (simulasi lolos) |
| 6 | Jum 6 Nov | B: eksekusi nyata di mainnet (nominal kecil). C: alur transfer NFT | Tx nyata pertama dari vault |
| 7 | Sab 7 Nov | Momen "wow": transfer NFT → pemilik lama ditolak, pemilik baru berhasil | Skenario demo inti jalan |
| 8 | Min 8 Nov | Deploy kontrak ke mainnet; uji MVP penuh di mainnet. D: draf README | **Gate G2** |
| 9 | Sen 9 Nov | Stretch #1: marketplace USDC (E/F) / polish UI (C) | — |
| 10 | Sel 10 Nov | Stretch #2: cross-chain withdraw atau pembeli gasless; perbaikan bug | — |
| 11 | Rab 11 Nov | **Feature freeze.** Test, README final, diagram, kumpulkan tx hash bukti | README lolos uji "orang baru bisa jalankan" |
| 12 | Kam 12 Nov | Rekam video demo; uji dengan wallet baru; repo siap dipublikasikan | **Gate G3**: video jadi |
| 13 | Jum 13 Nov | Repo dibuat publik (oleh manusia); post demo di X (oleh manusia); siapkan payload submission | Link repo + link post X |
| 14 | Sab 14 Nov | Cek ulang HACKATHON.md live, review payload bersama tim, **submit ≤ 12:00 UTC** | HTTP 201 dari API submission |

## 6. Titik keputusan (go / no-go)

| Gate | Kapan | Syarat lanjut | Jika gagal |
|---|---|---|---|
| **G1** | 2 Nov, akhir hari UTC | S15 (kontrak memanggil MPC) dan S16 (deposit untuk alamat vault) lolos | Ganti ke **Arisan DAO** (semua dependensi sudah ✅); hari 3–14 dipakai ulang dengan peran yang sama |
| **G2** | 8 Nov | MVP 1–5 jalan di mainnet | Potong scope: demo di testnet MPC + `simulate_intents` mainnet + satu tx nyata kecil |
| **G3** | 12 Nov | Video demo jadi | Pakai rekaman per bagian yang sudah ada, jangan tambah fitur |

## 7. Garis besar demo 3 menit

- **0:00–0:30 — Hook**: "Kalau mau memberikan dompet kripto ke orang lain, sekarang kamu harus memberikan private key-nya. Vault Card mengubah dompet menjadi NFT."
- **0:30–1:30 — Inti**: mint → isi USDC → transfer NFT ke teman → pemilik lama mencoba menarik dana dan **ditolak** → pemilik baru menarik dana dan **berhasil**.
- **1:30–2:30 — Kredibilitas teknis**: tunjukkan tx di explorer, tanda tangan MPC (Chain Signatures) yang diterima `intents.near`, listing lock mencegah penjual menguras vault.
- **2:30–3:00 — Penutup**: kegunaan (gift card lintas-chain, warisan, jual posisi OTC) + model bisnis (fee 0,5% per penjualan).

## 8. Checklist submission (dari HACKATHON.md)

Diputuskan manusia (jangan diisi AI): nama proyek (unik), nama team lead, email (unik), ukuran tim (`4 - 6` / `6 - 8` / `8+`), akun NEAR mainnet untuk payout (dibuat sendiri), link repo publik, link post X, deskripsi 20–2000 karakter, persetujuan kalimat kontak.
Usulan track: `nfts`, `defi`, `open`.
Repo publik sebelum 14 Nov 23:59 UTC; post X wajib menyebut "built at NEAR HACKATHON" + video/screenshot; satu kali submit, tidak bisa diedit.

## 9. Risiko utama

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Kontrak tidak bisa memanggil MPC (S15 gagal) | Ide tidak jalan | Gate G1 → Arisan DAO |
| Butuh dana mainnet sungguhan | Demo tertunda | Siapkan ±5 NEAR + sedikit USDC sebelum 1 Nov (deploy kontrak ±2,3 NEAR + uji) |
| Wallet connect di browser belum terbukti (S12) | Frontend tertunda | Spike hari 1; cadangan: login sederhana khusus demo |
| Keamanan dipertanyakan (Intents pernah di-exploit 1 Okt) | Juri ragu | Listing lock, nonce berversi, simulasi sebelum eksekusi, klaim jujur di README |
| Aturan "build during hackathon" | Diskualifikasi | Repo baru mulai 1 Nov; kode ditulis ulang, bukan salin dari `spikes/`; tanya organizer di Discord |

## 10. Yang boleh disiapkan sebelum 1 Nov (bukan kode)

- [ ] Baca daftar ide Illia (x.com/ilblackdragon/status/2106269343881519444) — bisa mengubah prioritas
- [ ] Post pertanyaan di Discord NEAR: kredit NEAR AI + boleh tidaknya skrip uji sebelum 1 Nov
- [ ] Tetapkan peran A–F untuk tiap anggota tim
- [ ] Siapkan akun NEAR mainnet untuk payout + dana demo ±5 NEAR (dibuat dan diisi sendiri oleh tim)
- [ ] Siapkan nama proyek (cek keunikan), email kontak, nama team lead
- [ ] Pasang tooling di laptop semua anggota: Node 24, Rust + `cargo-near` 0.22.0 (WSL di Windows)
- [ ] Sketsa alur layar di kertas/whiteboard (aset final baru dibuat setelah 1 Nov)
