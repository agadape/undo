# DEPLOY — langkah untuk tim (testnet)

Semua akun di sini NEAR **testnet**. Kunci hanya di `.env` (gitignored) dan di pengaturan rahasia Vercel / Cloudflare / GitHub. Jangan pernah commit `.env`.

Status per 2 Nov 2026:
- `next build` lolos.
- Tidak ada nilai rahasia `.env` di file lain (dipindai 200 file).
- Kontrak demo publik sudah terkunci: `demo.nh-s26r-mvz1zxfx.testnet`.

## 1. GitHub (manusia)
1. Buat repo **private** dulu. Jadikan publik hanya saat submit.
2. Bilang ke Claude "commit + push". Claude tidak push tanpa diminta.
3. Sebelum push, cek ulang: `git status` tidak boleh memuat `.env`, `.data/`, atau `submission*.json`.

## 2. Vercel (manusia buat akun, lalu impor repo)
- Project → Import repo → **Root Directory: `undo/app`**. Framework: Next.js, Node **24.x** (sudah di `engines`).
- Storage → Create **Blob** store, akses **Private**, lalu Connect ke project. Vercel mengisi `BLOB_STORE_ID` sendiri lewat OIDC (atau `BLOB_READ_WRITE_TOKEN`). Store ini menyimpan ciphertext bukti dan status sidang.
- Environment Variables (Production), salin nilainya dari `.env`:

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
- **Cadangan:** `.github/workflows/cobacuri-guard.yml`. Isi GitHub Secrets dengan nama yang sama.
- Kunci penjaga cuma function-call key (panic / finalize / unlock / release_expired), bukan full access.

## 4. Build reproducible (S25, opsional)
Docker Desktop → Settings → Resources → WSL integration → Ubuntu-24.04. Tambahkan `[package.metadata.near.reproducible_build]` ke kontrak, lalu jalankan `cargo near build reproducible-wasm`. Code hash v1 yang diterbitkan: `5q9rRircqxg9Bko6gHa4k1ejQzvrb9zgQkkXaZSPsrGz`.

## 5. Keputusan tim
- **Publikasikan kunci umpan Coba Curi?** Set `COBACURI_PUBLISH_KEY=1` hanya kalau tim setuju.
- **Saldo:** isi ulang faucet dan akun pengadilan dengan NEAR testnet sebelum demo.
- **Kredit NEAR AI:** terpakai sekitar $0.002 dari $10.
