# DEPLOY — langkah untuk tim (testnet)

Semua akun di sini NEAR **testnet**. Kunci hanya di `.env` (gitignored) dan di pengaturan rahasia Vercel / Cloudflare / GitHub. Jangan pernah commit `.env`.

Status per 2 Nov 2026:
- `next build` lolos.
- Tidak ada nilai rahasia `.env` di file lain (dipindai 200 file).
- Kontrak demo publik sudah terkunci: `demo.nh-s26r-mvz1zxfx.testnet`.

## 1. GitHub
- ✅ Repo private sudah ada: https://github.com/agadape/undo (branch `main`). Jadikan publik hanya saat submit.
- Undang anggota tim lewat Settings → Collaborators.
- `recon/` dan `spikes/out/ref/` sengaja tidak masuk git. Isinya riset internal dan salinan dokumen pihak lain.
- Akhir baris dikunci ke LF (`.gitattributes`), supaya `build.sh` dan byte PROMPT pengadilan tidak berubah di Windows.
- Sebelum push, cek ulang: `git status` tidak boleh memuat `.env`, `.data/`, atau `submission*.json`.

## 2. Vercel
✅ Sudah live: **https://undo-cyan.vercel.app**
- Project `undo` di tim `daves-projects-3628ad99` (Hobby). Tersambung ke `agadape/undo`, root `undo/app`, Node 24.x lewat `engines`.
- Setiap push ke `main` otomatis deploy ke produksi. URL preview dikunci Vercel Authentication; domain produksi publik.
- Blob store `undo-court`: private, region iad1, tersambung ke production dan preview. Isinya ciphertext bukti dan catatan sidang.
- Environment variables (production + preview) sudah diisi dari `.env`. Kunci dan API key bertipe *sensitive*, jadi tidak bisa dibaca balik dari dashboard.
- `COUNCIL_PASSCODE` dibuat acak dan disimpan di `.env`. Masukkan nilainya di halaman `/dewan`.
- Kunci umpan Coba Curi **tidak** dikirim ke Vercel. Kalau tim memutuskan mempublikasikannya, tambahkan `COBACURI_DEMO_PRIVATE_KEY` lalu set `COBACURI_PUBLISH_KEY=1`.
- Diuji 3 Nov:
  - semua halaman membalas 200;
  - `/api/cobacuri/stats` membaca kontrak;
  - passcode salah ditolak;
  - pembuatan dompet demo di `/dompet` berhasil (100 rUSDC).
- Isi ulang NEAR testnet sebelum demo:
  - akun pengadilan `NEAR_ACCOUNT_ID` (≈1,9 NEAR per 3 Nov);
  - faucet `nh-s21-mvz19hwe.testnet` (≈8,2 NEAR), cadangan kalau helper testnet kena batas.

Variabel yang dipakai server:

| Variabel | Keterangan |
|---|---|
| `NEAR_AI_API_KEY` | wajib (sidang AI) |
| `NEAR_ACCOUNT_ID`, `NEAR_PRIVATE_KEY` | akun pengadilan + anggota DAO |
| `NEAR_UNDO_FAUCET_ID`, `NEAR_UNDO_FAUCET_PRIVATE_KEY` | faucet akun demo (kalau kosong, pakai `NEAR_S21_CONTRACT_*`) |
| `COUNCIL_PASSCODE` | **wajib**; tanpa ini tombol dewan mati di Vercel |
| `COURT_MAX_RUNS_PER_HOUR` | `20` (melindungi kredit $10) |
| `COBACURI_*` | untuk halaman /coba-curi |
| `NEXT_PUBLIC_UNDO_CONTRACT` | opsional; default kontrak demo terkunci |

- Batas Hobby: fungsi maksimal 300 detik, cukup untuk satu panggilan AI.
- Setelah deploy, buka `/janji` dan `/dompet`, lalu jalankan latihan Panik sekali.

## 3. Penjaga Coba Curi (pindah dari laptop)
Saat ini penjaga jalan lokal (`node guard/run-local.mjs`).
- **Utama:** Cloudflare Worker (`undo/app/guard/wrangler.toml`, cron).
  ```
  npx wrangler secret put COBACURI_GUARD_FC_KEY
  ```
  Lakukan hal yang sama untuk `COBACURI_GUARD_ID`, `COBACURI_CONTRACT_ID`, `COBACURI_DEMO_ID`. Lalu jalankan `npx wrangler deploy`.
- **Cadangan:** `.github/workflows/cobacuri-guard.yml` (cron tiap 5 menit). Workflow ini **sedang dimatikan** supaya tidak gagal terus dan menghabiskan menit Actions. Isi dulu GitHub Secrets dengan nama yang sama, lalu nyalakan:
  ```
  gh workflow enable cobacuri-guard -R agadape/undo
  ```
  Di repo private, cron tiap 5 menit memakan sekitar 300 menit Actions per hari, padahal jatah gratisnya 2000 menit per bulan. Nyalakan hanya saat repo publik atau menjelang demo.
- Kunci penjaga cuma function-call key (panic / finalize / unlock / release_expired), bukan full access.

## 4. Build reproducible (S25, opsional)
Docker Desktop → Settings → Resources → WSL integration → Ubuntu-24.04. Tambahkan `[package.metadata.near.reproducible_build]` ke kontrak, lalu jalankan `cargo near build reproducible-wasm`. Code hash v1 yang diterbitkan: `5q9rRircqxg9Bko6gHa4k1ejQzvrb9zgQkkXaZSPsrGz`.

## 5. Keputusan tim
- **Publikasikan kunci umpan Coba Curi?** Set `COBACURI_PUBLISH_KEY=1` hanya kalau tim setuju.
- **Saldo:** isi ulang faucet dan akun pengadilan dengan NEAR testnet sebelum demo.
- **Kredit NEAR AI:** terpakai sekitar $0.002 dari $10.
