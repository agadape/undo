# DEPLOY — langkah untuk tim (testnet)

Semua akun di sini NEAR **testnet**. Kunci hanya di `.env` (gitignored) dan di pengaturan rahasia Vercel / GitHub. Jangan pernah commit `.env`.

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

## 3. Penjaga Coba Curi (GitHub Actions)
Penjaga jalan di GitHub Actions: `.github/workflows/cobacuri-guard.yml`, satu tick tiap 15 menit. Jendela akun umpan 2 jam, jadi keterlambatan cron GitHub masih aman.
- **Secrets** (Settings → Secrets and variables → Actions): `COBACURI_GUARD_FC_KEY` (wajib), `COBACURI_GUARD_PRIVATE_KEY` dan `COBACURI_DEMO_PRIVATE_KEY` (untuk mengisi ulang umpan setelah satu ronde). Opsional: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`. ID akun sudah tertulis di workflow.
  Isi dari `.env` tanpa mencetak nilainya (PowerShell, dari root repo):
  ```powershell
  Get-Content .env | ForEach-Object { if ($_ -match '^(COBACURI_GUARD_FC_KEY|COBACURI_GUARD_PRIVATE_KEY|COBACURI_DEMO_PRIVATE_KEY)=(.+)$') { gh secret set $Matches[1] -R agadape/undo --body $Matches[2].Trim() } }
  ```
- **Nyalakan dan jalankan sekali:**
  ```
  gh workflow enable cobacuri-guard -R agadape/undo
  gh workflow run cobacuri-guard -R agadape/undo
  ```
- **Menit Actions:** repo private dapat 2.000 menit gratis per bulan, dan cron 15 menit memakai sekitar 100 menit per hari. Setelah repo publik menit Actions gratis, jadi cron bisa diganti ke `*/5 * * * *`.
- **Status:** riwayat run ada di https://github.com/agadape/undo/actions/workflows/cobacuri-guard.yml. Halaman `/coba-curi` menampilkan run terakhir lewat API publik GitHub; status ini baru muncul setelah repo publik. Run yang gagal (setelah satu kali coba ulang) ditandai merah.
- **Lokal:** `node guard/run-local.mjs` dari `undo/app` (tick tiap 30 detik), misalnya saat merekam demo. Boleh jalan bersamaan dengan Actions karena tick-nya idempoten.
- **Cloudflare Worker** (`guard/worker.mjs`, `guard/wrangler.toml`) tetap tersedia kalau suatu saat butuh tick tiap menit.
- Kunci penjaga cuma function-call key (panic / finalize / unlock / release_expired), bukan full access.

## 4. Build reproducible (S25, opsional)
Docker Desktop → Settings → Resources → WSL integration → Ubuntu-24.04. Tambahkan `[package.metadata.near.reproducible_build]` ke kontrak, lalu jalankan `cargo near build reproducible-wasm`. Code hash v1 yang diterbitkan: `5q9rRircqxg9Bko6gHa4k1ejQzvrb9zgQkkXaZSPsrGz`.

## 5. Keputusan tim
- **Publikasikan kunci umpan Coba Curi?** Set `COBACURI_PUBLISH_KEY=1` hanya kalau tim setuju.
- **Saldo:** isi ulang faucet dan akun pengadilan dengan NEAR testnet sebelum demo.
- **Kredit NEAR AI:** terpakai sekitar $0.002 dari $10.
