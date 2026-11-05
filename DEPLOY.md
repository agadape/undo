# DEPLOY — langkah untuk tim (testnet)

Semua akun di sini NEAR **testnet**. Kunci hanya di `.env` (gitignored) dan di pengaturan rahasia Vercel / GitHub / Cloudflare. Jangan pernah commit `.env`.

Status per 2 Nov 2026:
- `next build` lolos.
- Tidak ada nilai rahasia `.env` di file lain (dipindai 200 file).
- Kontrak demo publik v2 (dipakai aplikasi sejak 5 Nov) sudah terkunci: `undo-demo-v2.testnet`, build reproducible `AzDhXsj2…` (`spikes/v2_public_deploy.mjs`). v1 `demo.nh-s26r-mvz1zxfx.testnet` tetap hidup.

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

## 3. Penjaga Coba Curi (Cloudflare Worker + GitHub Actions)
Penjaga utama adalah Cloudflare Worker `undo-cobacuri-guard` (`undo/app/guard/worker.mjs`, `wrangler.toml`): satu tick tiap menit. GitHub Actions (`.github/workflows/cobacuri-guard.yml`) tetap jalan sebagai cadangan, walaupun jadwal GitHub di repo yang sepi bisa berjam-jam jaraknya. Tick-nya idempoten, jadi keduanya boleh jalan bersamaan.
- **Status:** https://undo-cobacuri-guard.agadape.workers.dev mengembalikan heartbeat terakhir `{at, ok, actions}` (ditulis ke KV tiap 2 menit; batas gratis KV 1.000 tulisan per hari). Halaman `/coba-curi` menampilkannya.
- **Deploy ulang** (PowerShell, dari `undo/app/guard`; pakai `npx.cmd` karena kebijakan skrip PowerShell memblokir `npx.ps1`):
  ```powershell
  npx.cmd --yes wrangler@4 login
  npx.cmd --yes wrangler@4 deploy
  ```
  Perubahan jadwal cron bisa butuh sampai ~25 menit sebelum tick pertama jalan.
- **Secrets Cloudflare** (`COBACURI_GUARD_FC_KEY`, `COBACURI_GUARD_PRIVATE_KEY`, `COBACURI_DEMO_PRIVATE_KEY`), dari `.env` tanpa mencetak nilainya:
  ```powershell
  cd C:\Project_Dave\NEAR_Hackathon\undo\app\guard; $s=@{}; Get-Content ..\..\..\.env | ForEach-Object { if ($_ -match '^(COBACURI_GUARD_FC_KEY|COBACURI_GUARD_PRIVATE_KEY|COBACURI_DEMO_PRIVATE_KEY)=(.+)$') { $s[$Matches[1]] = $Matches[2].Trim() } }; [IO.File]::WriteAllText("$PWD\secrets.tmp.json", ($s | ConvertTo-Json)); npx.cmd --yes wrangler@4 secret bulk secrets.tmp.json; Remove-Item secrets.tmp.json
  ```
- **Secrets GitHub** (nama sama) untuk cadangan:
  ```powershell
  Get-Content .env | ForEach-Object { if ($_ -match '^(COBACURI_GUARD_FC_KEY|COBACURI_GUARD_PRIVATE_KEY|COBACURI_DEMO_PRIVATE_KEY)=(.+)$') { gh secret set $Matches[1] -R agadape/undo --body $Matches[2].Trim() } }
  ```
  Menit Actions: repo private dapat 2.000 menit gratis per bulan; cron 15 menit memakai sekitar 100 menit per hari. Setelah repo publik menitnya gratis.
- **Lokal** (misalnya saat merekam demo, tick tiap 30 detik): `node guard/run-local.mjs` dari `undo/app`.
- **Telegram** (bot `@undo_guard_agadape_near_bot`): penjaga mengirim pesan saat Panik, finalisasi, buka kunci, isi ulang umpan, dan saat bermasalah (sekali, lalu "pulih"). Token ada di `.env` sebagai `TELEGRAM_BOT_TOKEN`; `node spikes/telegram_setup.mjs --test` mencari chat ID, menyimpannya sebagai `TELEGRAM_CHAT_ID`, dan mengirim pesan uji. Simpan keduanya ke Cloudflare (dan GitHub untuk cadangan):
  ```powershell
  cd C:\Project_Dave\NEAR_Hackathon\undo\app\guard; $s=@{}; Get-Content ..\..\..\.env | ForEach-Object { if ($_ -match '^(TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID)=(.+)

## 4. Build reproducible (v2, sudah)
Docker Desktop dengan integrasi WSL untuk Ubuntu-24.04 (Settings → Resources → WSL integration). Kalau integrasi macet ("backend.sock: no such file"): Quit Docker Desktop, `wsl --shutdown`, buka Docker Desktop lagi; jangan `wsl -t` saat Docker jalan.
Di WSL, dari clone bersih (repo di /mnt/c terlihat "kotor" karena izin file):
```
git clone /mnt/c/Project_Dave/NEAR_Hackathon ~/undo-repro && cd ~/undo-repro/undo/contracts/undo-token
cargo near build reproducible-wasm --out-dir ~/nh-v2-repro
```
Hasil di commit `65c1c0e`: `AzDhXsj2JzWQAEjScj5SrubF4Q96VCLPHTRawcpHnZkJ` (dua kali build, hash sama). Image dikunci di `[package.metadata.near.reproducible_build]` (Cargo.toml).

## 5. Keputusan tim
- **Publikasikan kunci umpan Coba Curi?** Set `COBACURI_PUBLISH_KEY=1` hanya kalau tim setuju.
- **Saldo:** isi ulang faucet dan akun pengadilan dengan NEAR testnet sebelum demo.
- **Kredit NEAR AI:** terpakai sekitar $0.002 dari $10.
) { $s[$Matches[1]] = $Matches[2].Trim() } }; [IO.File]::WriteAllText("$PWD\secrets.tmp.json", ($s | ConvertTo-Json)); npx.cmd --yes wrangler@4 secret bulk secrets.tmp.json; Remove-Item secrets.tmp.json
  cd C:\Project_Dave\NEAR_Hackathon; Get-Content .env | ForEach-Object { if ($_ -match '^(TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID)=(.+)

## 4. Build reproducible (v2, sudah)
Docker Desktop dengan integrasi WSL untuk Ubuntu-24.04 (Settings → Resources → WSL integration). Kalau integrasi macet ("backend.sock: no such file"): Quit Docker Desktop, `wsl --shutdown`, buka Docker Desktop lagi; jangan `wsl -t` saat Docker jalan.
Di WSL, dari clone bersih (repo di /mnt/c terlihat "kotor" karena izin file):
```
git clone /mnt/c/Project_Dave/NEAR_Hackathon ~/undo-repro && cd ~/undo-repro/undo/contracts/undo-token
cargo near build reproducible-wasm --out-dir ~/nh-v2-repro
```
Hasil di commit `65c1c0e`: `AzDhXsj2JzWQAEjScj5SrubF4Q96VCLPHTRawcpHnZkJ` (dua kali build, hash sama). Image dikunci di `[package.metadata.near.reproducible_build]` (Cargo.toml).

## 5. Keputusan tim
- **Publikasikan kunci umpan Coba Curi?** Set `COBACURI_PUBLISH_KEY=1` hanya kalau tim setuju.
- **Saldo:** isi ulang faucet dan akun pengadilan dengan NEAR testnet sebelum demo.
- **Kredit NEAR AI:** terpakai sekitar $0.002 dari $10.
) { gh secret set $Matches[1] -R agadape/undo --body $Matches[2].Trim() } }
  ```
- Kunci penjaga cuma function-call key (panic / finalize / unlock / release_expired), bukan full access.

## 4. Build reproducible (v2, sudah)
Docker Desktop dengan integrasi WSL untuk Ubuntu-24.04 (Settings → Resources → WSL integration). Kalau integrasi macet ("backend.sock: no such file"): Quit Docker Desktop, `wsl --shutdown`, buka Docker Desktop lagi; jangan `wsl -t` saat Docker jalan.
Di WSL, dari clone bersih (repo di /mnt/c terlihat "kotor" karena izin file):
```
git clone /mnt/c/Project_Dave/NEAR_Hackathon ~/undo-repro && cd ~/undo-repro/undo/contracts/undo-token
cargo near build reproducible-wasm --out-dir ~/nh-v2-repro
```
Hasil di commit `65c1c0e`: `AzDhXsj2JzWQAEjScj5SrubF4Q96VCLPHTRawcpHnZkJ` (dua kali build, hash sama). Image dikunci di `[package.metadata.near.reproducible_build]` (Cargo.toml).

## 5. Keputusan tim
- **Publikasikan kunci umpan Coba Curi?** Set `COBACURI_PUBLISH_KEY=1` hanya kalau tim setuju.
- **Saldo:** isi ulang faucet dan akun pengadilan dengan NEAR testnet sebelum demo.
- **Kredit NEAR AI:** terpakai sekitar $0.002 dari $10.
