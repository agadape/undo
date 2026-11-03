# CLAIMS — what Undo claims, and how to check each claim yourself

Everything runs on **NEAR testnet**. "rUSDC" is wrapped testnet USDC (`usdc.fakes.testnet`, open mint), not real money.

Legend:
- ✅ shown on testnet (transaction linked)
- 🧪 covered by unit or property tests
- ⚠️ partial; the gap is written next to it
- ❌ not built

Explorer: `https://testnet.nearblocks.io/txns/<hash>`. Line numbers refer to [`undo/contracts/undo-token/src/lib.rs`](undo/contracts/undo-token/src/lib.rs) unless another file is named.

Contracts referenced below:

| Name | Account | State |
|---|---|---|
| Public demo (used by the web app) | `demo.nh-s26r-mvz1zxfx.testnet` | locked (0 keys); window 300 s, contest 120 s, evidence 300 s, council timeout 1800 s, recovery delay 120 s |
| Dev contract (scripted scenarios) | `nh-v1undo-mvz2j3bw.testnet` | **still has a key** (development); window 90 s |
| Locked copy (S25) | `lockedmvz3cg5t.nh-v1undo-mvz2j3bw.testnet` | locked (0 keys) |
| Coba Curi challenge | `cobacuri.nh-s26f-mvz1xz1q.testnet` | locked (0 keys); window 2 h |
| Court spike (S26, real model) | `nh-s26r-mvz1zxfx.testnet` | spike contract |
| Council | `nhspike-mvp6a0dx.sputnikv2.testnet` | Sputnik DAO v2 |

All four Undo instances run the same wasm: code hash `5q9rRircqxg9Bko6gHa4k1ejQzvrb9zgQkkXaZSPsrGz`.

---

## 1. Money promises (J1–J6)

| # | Claim | Code | Tests | On-chain evidence | Status |
|---|---|---|---|---|---|
| J1 | Pending money can end in only two places: the receiver, or the sender's recovery account (the sender itself when there is none). No function takes a destination argument, the council's included | `resolve` (l. 729) takes `(transfer_id, reverse, reason)`. `finalize` (561) and `release_expired` (741) take only a transfer id | `j1_*` in [`tests.rs`](undo/contracts/undo-token/src/tests.rs) (l. 117–158) and the property test (§5) | DAO vote executing `resolve`: 150 rUSDC back to the buyer's recovery account, [`3Lzqga5M…`](https://testnet.nearblocks.io/txns/3Lzqga5MTeEsVLwdfmUVHjCH91ygPyeDdb6BGi2LKe5G). Public demo contract, dispute #1 (3 Nov): DAO proposal #11 following the TEE recommendation, vote [`74tBPL6w…`](https://testnet.nearblocks.io/txns/74tBPL6wvkq8Y9fSiVpgohfvRXoR6xrnvx8Ur3yy1MVc) → 30 rUSDC to the buyer's recovery account `undo-bf876l.testnet` | ✅ 🧪 |
| J2 | Only money still inside its window can be touched. A matured transfer is final like plain USDC | `report` (574) and `panic` (478) skip or refuse matured transfers | `j2_cannot_report_after_the_window`, `j2_panic_does_not_touch_final_transfers`, property test | — | 🧪 |
| J3 | The AI never moves money. If the council stays silent past the timeout, the challenged state stands: a fraud report pays the receiver, and a contested panic keeps the panic | `post_recommendation` (614) only stores the recommendation. `release_expired` (741) applies council silence | `j3_council_silence_after_a_report_pays_the_receiver`, `j3_council_silence_after_a_contested_panic_keeps_the_panic`, `j3_timeout_cannot_be_applied_early`, `j7_an_honest_court_recommendation_is_stored_and_moves_no_money` | Recommendation stored, money unmoved: [`5wYViWsD…`](https://testnet.nearblocks.io/txns/5wYViWsDU5AmdoAJR7L6zZ57gp9uRiDiZByCYZVVvJfB) | ✅ 🧪 (timeout path unit-tested only) |
| J4 | Only the sender or its recovery account can report, and only with a bond (0.01 NEAR). A losing side is counted on-chain | `require!` at l. 586; `get_reputation` (810) | `j4_a_third_party_cannot_report`, `j4_a_report_needs_the_bond`, `j4_a_losing_reporter_is_counted`, `a6_a_thief_who_contests_loses_the_bond_and_is_counted` | Outsider report rejected with "only the sender or its recovery account can report" (step 18 of [`spikes/out/v1_flow.json`](spikes/out/v1_flow.json)); report with bond [`C2n55Xnn…`](https://testnet.nearblocks.io/txns/C2n55XnnhR5nN76CnW4PPCkqKTXeChQWX4Apo95pr689). Public demo contract: after dispute #1, `get_reputation("undo-yq7k63.testnet")` = 1 lost dispute | ✅ 🧪 |
| J5 | Nobody, including us, can change the rules. The contract has no owner functions; parameters are fixed in `new`; deployed instances have no access keys | `new` (286); only the council-gated `register_tee_signer` (750) and `register_procedure` (762) exist | `j5_only_the_council_resolves`, `j5_only_the_council_pins_the_tee_key` | S25: key deleted [`94mtmFAN…`](https://testnet.nearblocks.io/txns/94mtmFANajMAzTKgACwhrExn3jBo77KTJqbq97NLToSa). Public demo, Coba Curi and locked copy: 0 keys, code hash = sha256 of [`undo/contracts/wasm/undo_token.wasm`](undo/contracts/wasm/undo_token.wasm) (commands in §6) | ✅ ⚠️ reproducible build not done yet: NEP-330 `build_info` is `null`, so the hash matches **our published wasm**, not yet a build you redo from source in Docker |
| J6 | 1 rUSDC is always redeemable for 1 USDC: rUSDC supply = USDC held by the contract | `get_reserve` (796) | `j6_supply_tracks_usdc_in_and_out`, property test | Step 34 of `v1_flow.json`: supply 1180 = USDC held 1180 | ✅ 🧪 |

## 2. Panic button: theft undone without any vote

| Claim | Code | Tests | On-chain evidence | Status |
|---|---|---|---|---|
| A recovery account (for example, a phone) can press **panic**. That locks the account, freezes every pending outgoing transfer, and turns the remaining balance into a frozen "sweep" toward the recovery account. If nobody contests within the contest window, anyone can `finalize` and the money returns. No council vote is needed | `panic` (478), `finalize` (561), `unlock` (529) | `a1_theft_is_undone_by_panic_without_any_vote`, `a1_a_locked_account_cannot_send`, `a1_finalize_waits_for_the_contest_window`, `a2_waiting_does_not_help_the_thief` | Theft of 900 [`7YaUHhxm…`](https://testnet.nearblocks.io/txns/7YaUHhxmhJ4ZjKTMkxiMouzWtZs1ZWXpxaHq25rg7KGD) → panic [`2BRgWxjk…`](https://testnet.nearblocks.io/txns/2BRgWxjkGNKvMUw6vW6f7FdtxEHQzGwgn1PXDns8dVw7) → finalize [`94ouctKa…`](https://testnet.nearblocks.io/txns/94ouctKaHGaXGudo4r8gPqY1ommz7cjS2tn3WsArSYuH) + [`2TspPGWJ…`](https://testnet.nearblocks.io/txns/2TspPGWJyGusQAm5QMWpMdoxh4KT7SoBMZhXsjwJEo1D); recovery account holds all 1000, thief 0 | ✅ 🧪 |
| Panic needs no full-access key: a function-call key limited to `panic` is enough. A guard bot can hold it without being able to move money | `panic` takes no deposit | — | Step 8 of `v1_flow.json` (signed by a `panic`-only key) | ✅ |
| The thief cannot swap the recovery account. A change is instant only for an empty account; otherwise it waits `recovery_delay` (demo 120 s, intended product setting 7 days), the old recovery account can cancel it, and it is frozen while the account is locked | `set_recovery` (445), `cancel_recovery_change` (464) | `a3_*`, `a4_*` | Swap attempt only scheduled [`3xuU8AaX…`](https://testnet.nearblocks.io/txns/3xuU8AaX2eUYoRc8cybKHjCv8ApQzYqWfQEWKR7iDXKH) | ✅ 🧪 |
| A stolen recovery account cannot just take the balance: the sweep is frozen, and the owner's main key can contest it | `contest` (541) | `a7_a_stolen_recovery_account_cannot_just_take_the_balance`, `a7_the_recovery_account_cannot_contest_its_own_freeze` | — | 🧪 |
| Pending money cannot be moved early. "Barang diterima" (goods received, early release) works only from the sender's recovery account, never from the main key | `release` (419), check at l. 425; available-balance check at l. 931 | `a5_the_main_key_cannot_skip_the_window`, `a5_barang_diterima_from_the_recovery_account_pays_at_once` | Thief's unwrap of pending money rejected (step 5); main-key early release rejected (step 29); release from the recovery account [`9Tzh8frC…`](https://testnet.nearblocks.io/txns/9Tzh8frCoNbs5n3jHdvyFe6a8tzTJiKGFtmo4GijjEXY) | ✅ 🧪 |
| A real NEAR testnet wallet (not a demo key) ran the whole drill from the web app: onboarding, simulated theft, panic, finalize, unlock | [`undo/app/app/dompet/page.tsx`](undo/app/app/dompet/page.tsx), [`undo/app/lib/wallet.ts`](undo/app/lib/wallet.ts) | — | Team wallet `smoothicon6710.testnet`, 2 Nov | ✅ |
| Rule-based alert, no AI: any pending outgoing transfer or scheduled recovery change on an account whose recovery account is in this browser shows "Was this you?" on every page. **No — PANIC** signs `panic` with the recovery account. Transfers sent from the app's own Send form do not alert | [`undo/app/components/alerts.tsx`](undo/app/components/alerts.tsx) | — | 3 Nov, demo wallet `undo-hoi4gg.testnet`: own send #2 no alert; theft #3 (89.10 rUSDC) alerted; panic from the alert [`2CsqyyZu…`](https://testnet.nearblocks.io/txns/2CsqyyZu6MzZCmUj4vKdjFtuW5AjNs3sxyGBYZeXJHsB) froze #2, #3 and the sweep #4 | ✅ |

## 3. Private court with an on-chain procedure proof (J7)

| Claim | Code | Tests | On-chain evidence | Status |
|---|---|---|---|---|
| Evidence is encrypted **in the browser** to the attested NEAR AI model key (X25519 + HKDF-SHA256 + XChaCha20-Poly1305, NEAR AI E2EE v2). Only its sha256 goes on-chain and only ciphertext reaches our server | [`undo/app/lib/court.ts`](undo/app/lib/court.ts), [`undo/app/app/sidang/[id]/page.tsx`](undo/app/app/sidang/%5Bid%5D/page.tsx), `commit_evidence` (591), [`undo/app/app/api/court/evidence/route.ts`](undo/app/app/api/court/evidence/route.ts) (accepts an envelope only if its hash equals the commitment) | `j7_outsiders_cannot_commit_evidence`, `j7_late_evidence_is_rejected` | Evidence commits [`E1DnhQnB…`](https://testnet.nearblocks.io/txns/E1DnhQnBFEFNNq9bEcy1SxxPRfA7hkqkwXyDzmbkJuu2), [`9Ae9yjpR…`](https://testnet.nearblocks.io/txns/9Ae9yjpRUQhxTBjKMvB6R2rQisferFQcvSPfEe8MW2vD) | ✅ 🧪 |
| The contract verifies the TEE signature (`ed25519` over `MODEL:sha256(request):sha256(response)`, taken over the **encrypted** bytes) against the model key pinned by the council | `post_recommendation` (614), `env::ed25519_verify` at l. 664; `register_tee_signer` (750) | `j7_*` | S21 with real NEAR AI output: verify [`9iSHQkyt…`](https://testnet.nearblocks.io/txns/9iSHQkytUhq13Qu5EfMwRgrm2uvKKEXDT16Q5DNxtWP1) (2.3 Tgas). Council pin by DAO vote [`Fk4PB9n8…`](https://testnet.nearblocks.io/txns/Fk4PB9n8NU7QQVYbHjC8kqxi3UHA6tHefPRQinwRwRZL) | ✅ 🧪 |
| The contract proves **what the model read**. It rebuilds the canonical request bytes from three parts: the registered procedure (model, `max_tokens`, sha256 of the system prompt), this case's on-chain file (transfer id, amount, a nonce from `env::random_seed`), and every committed evidence envelope in order. It then matches that request against the signed hash. The system message is opened with a key the contract derives itself (ephemeral secret → X25519 with the pinned key → HKDF), because XChaCha20-Poly1305 is not key-committing | `post_recommendation` (614–728); `hkdf32` (265); X25519 at l. 680; evidence completeness check at l. 639 | `j7_dropping_the_sellers_evidence_is_rejected`, `j7_a_different_prompt_is_rejected_even_with_a_valid_signature`, `j7_a_recommendation_cannot_skip_a_side_that_may_still_answer` | S26, real attested model: honest post [`8aQgvZub…`](https://testnet.nearblocks.io/txns/8aQgvZubCrXeNdjhkF75R8tq6CpNoLp44Cuc7v5DdHbS) (**10.7 Tgas**). Rejected on testnet: evidence dropped, evidence reordered, wrong ephemeral secret, edited response, a request with a smuggled extra message (genuinely signed by the model), and a different prompt (genuinely read by the model). Product contract: server dropping evidence rejected (step 22 of `v1_flow.json`) | ✅ 🧪 |
| Only the verdict is opened. NEAR AI encrypts each response field under its own per-message key; the contract receives only the key of the `content` field, so the model's reasoning (which summarises the evidence) stays encrypted | `post_recommendation` opens only `"content":"…"` | — | S21: open verdict [`6HMjbreM…`](https://testnet.nearblocks.io/txns/6HMjbreMz84JUQNjt2wMAdoeN15NFjxi48PKKumt8JPt); the content key failed to open the reasoning ([`spikes/out/s21_onchain.json`](spikes/out/s21_onchain.json)) | ✅ |
| The court server needs no trust except to stay online. It cannot read the evidence, forge or alter a recommendation, swap the prompt, or drop a side; the contract rejects each of these. Anyone holding the ciphertext can call NEAR AI and post the result | [`undo/app/app/api/court/run/route.ts`](undo/app/app/api/court/run/route.ts) | see rows above | see rows above | ✅ |
| Full court flow from the live web app with the real model, on the **locked public demo contract**: encrypt → commit → run → stored recommendation | `undo/app` | — | Dispute #1 on `demo.nh-s26r-mvz1zxfx.testnet` (3 Nov): `post_recommendation` [`jbfHf7MX…`](https://testnet.nearblocks.io/txns/jbfHf7MXPi1NfP4zEShK3mJ52Vq88w2KK3VtKPcsy3G) (11.05 Tgas; recommendation `kembalikan` = return to the sender, confidence 80, NEAR AI cost ≈ $0.0006). Earlier run on the dev contract: [`7K7G3NtM…`](https://testnet.nearblocks.io/txns/7K7G3NtMfJ8xrUJmTEsRcwzWKvN3CqCtvDxhZonzJTGS) | ✅ |
| The court procedure (prompt) can change only by a public council vote, even on a locked contract. The app, the browser check on `/janji` and the contract use the same bytes | `register_procedure` (762); `PROMPT` in [`undo/app/lib/court.ts`](undo/app/lib/court.ts); [`spikes/app_procedure_v2.mjs`](spikes/app_procedure_v2.mjs) hashes that same file | — | Prompt v2 (English, bilingual public reason, sha256 `83acafca…`) registered by DAO proposal #10, vote [`E7oHNMWF…`](https://testnet.nearblocks.io/txns/E7oHNMWFefCwCwjKrwPbAWegaHjvRxfHwu4TYeaU3HxR). v1 (Indonesian, `de8f7b3a…`) is the prompt of the recorded spikes | ✅ |
| Prompt injection in the evidence is flagged, not obeyed | Prompt in [`undo/app/lib/court.ts`](undo/app/lib/court.ts) | — | S21, S26 (prompt v1) and dispute #1 above (prompt v2): seller evidence containing an "ignore all rules" instruction → recommendation `kembalikan` with `curiga_injeksi: true`. Public reason stored on-chain: "ID: Bukti penerima mengandung instruksi manipulatif dan tidak menyertakan bukti pengiriman sah. EN: Receiver evidence contains manipulative instruction and lacks valid proof of shipment." | ✅ (3 runs, not a benchmark) |

## 4. Coba Curi ("try to steal") challenge

| Claim | Evidence | Status |
|---|---|---|
| A locked, separate instance with a bait account whose key is meant to be published. A guard (the bait's recovery account, holding only a function-call key for `panic` / `finalize` / `unlock` / `release_expired`) reacts to every outgoing transfer | Contract `cobacuri.nh-s26f-mvz1xz1q.testnet` (0 keys), bait `curi.nh-s26f-mvz1xz1q.testnet`, guard code [`undo/app/guard/guard.mjs`](undo/app/guard/guard.mjs) | ✅ |
| Internal attack on 2 Nov, using the bait key: steal 300, `send_usdc` 200, swap the recovery account. The guard froze everything in ~33–40 s and locked the account. After the contest window it finalized all three back to the guard, unlocked the bait and refilled it. 0 rUSDC was cashed out | steal [`GAibyxQj…`](https://testnet.nearblocks.io/txns/GAibyxQjZvNGLiSqUk7qpEvBUGmHaqPoCSWK8apuTVGt), send_usdc [`95qW3qbR…`](https://testnet.nearblocks.io/txns/95qW3qbRs17kX73hvbRQihiE43DncbqNU1CdQ99hsugh), swap [`2RkZpPN4…`](https://testnet.nearblocks.io/txns/2RkZpPN4V1fGB44dPJkRvh1zZezrm6HnrBzd3rvHJJwE); finalize [`C5VZ9TQi…`](https://testnet.nearblocks.io/txns/C5VZ9TQiy8b4kRXVTSu1S5hT63goUk2tLQGHccv3Es1L), [`Huc5i5T4…`](https://testnet.nearblocks.io/txns/Huc5i5T4iQtunbiSmSwc5MpPaCLCxXSmaR7gh2kZxrjQ), [`H15Z2Uc3…`](https://testnet.nearblocks.io/txns/H15Z2Uc3HDvJwj8E2jB3cPa7zfJdWb7B5LvkMFFSpovB); unlock [`ELSPVQJD…`](https://testnet.nearblocks.io/txns/ELSPVQJDtVrACt7aiiZE34FUv1FZQV2ofkKuTaqfFb4B); refill [`9chPbVqX…`](https://testnet.nearblocks.io/txns/9chPbVqXLAFEfiEyvVHCT5Haf6kFSjk2quwgY5183pU6). Live counts: https://undo-cyan.vercel.app/coba-curi | ✅ |
| What this proves: **the key can be stolen, the money cannot be cashed out** while the guard (or the owner) presses panic within the window. It does not prove the account cannot be broken into | — | framing |
| The bait key is public | Not yet: publication is the team's decision | ❌ |
| The guard runs without a team laptop: GitHub Actions, one idempotent tick every 15 minutes. Reaction is therefore minutes rather than the ~35 s of the 2 Nov laptop run, still well inside the 2-hour window | [`.github/workflows/cobacuri-guard.yml`](.github/workflows/cobacuri-guard.yml), first run [41669369526](https://github.com/agadape/undo/actions/runs/41669369526) on 3 Nov; run history on the [workflow page](https://github.com/agadape/undo/actions/workflows/cobacuri-guard.yml) | ✅ |
| A second, faster guard (Cloudflare Worker, every minute) | Code is ready in [`undo/app/guard/worker.mjs`](undo/app/guard/worker.mjs), not deployed | ⚠️ |

## 5. Tests

| Claim | How to run | Status |
|---|---|---|
| 40 unit tests named after the promises and threats (`j1_…`–`j7_…`, `a1_…`–`a9_…`) | `cd undo/contracts && cargo test -p undo_token` | 🧪 |
| Property test: random sequences of wrap, transfer, send_usdc, unwrap, recovery changes, panic, unlock, report, contest, finalize, council resolve, timeout, early release, withdraw, evidence commits and time jumps. After **every** step it checks J6 (supply conservation), J1 (final money only at the receiver, the sender, or an account that was the sender's recovery) and J2 (finished transfers never change). 40 seeds × 400 steps = 16,000 steps passed | `UNDO_FUZZ_SEEDS=40 cargo test --release -p undo_token property` (~4 min; the default is 4 seeds) — [`fuzz_tests.rs`](undo/contracts/undo-token/src/fuzz_tests.rs) l. 286 | 🧪 |
| 35-step testnet scenario on the product contract (theft, scam, honest payments, each attack rejected) | `node spikes/v1b_testnet_flow.mjs` (needs a funded `.env`); recorded output [`spikes/out/v1_flow.json`](spikes/out/v1_flow.json) | ✅ |

## 6. Check it yourself (no keys needed)

Access keys of the public demo contract (expect `"keys":[]`):
```bash
curl -s https://rpc.testnet.fastnear.com -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key_list","finality":"final","account_id":"demo.nh-s26r-mvz1zxfx.testnet"}}'
```

On-chain code hash (expect `5q9rRircqxg9Bko6gHa4k1ejQzvrb9zgQkkXaZSPsrGz`):
```bash
curl -s https://rpc.testnet.fastnear.com -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"demo.nh-s26r-mvz1zxfx.testnet"}}'
```

sha256 of the published wasm, in base58 (same value expected):
```bash
node -e "const h=require('crypto').createHash('sha256').update(require('fs').readFileSync('undo/contracts/wasm/undo_token.wasm')).digest();const A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+h.toString('hex')),s='';while(n>0n){s=A[Number(n%58n)]+s;n/=58n}console.log(s)"
```

Config: `total_supply` of rUSDC, the pinned court key (`court.signer`), the prompt hash and `max_tokens`:
```bash
curl -s https://rpc.testnet.fastnear.com -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"demo.nh-s26r-mvz1zxfx.testnet","method_name":"get_config","args_base64":"e30="}}'
```

USDC held by the contract (J6: must equal `total_supply`):
```bash
curl -s https://rpc.testnet.fastnear.com -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"usdc.fakes.testnet","method_name":"ft_balance_of","args_base64":"eyJhY2NvdW50X2lkIjoiZGVtby5uaC1zMjZyLW12ejF6eGZ4LnRlc3RuZXQifQ=="}}'
```

In both answers, `result.result` is the returned JSON encoded as a byte array. The web page https://undo-cyan.vercel.app/janji shows the same checks decoded. It also recomputes the prompt hash in your browser and compares it with the on-chain value.

## 7. Trust boundaries (what you still have to trust)

- **TEE attestation is verified off-chain, not in the contract.** A full TDX/GPU report is too heavy for on-chain verification. Before every court run, the server verifies the model's attestation with the NEAR AI SDK (`verifyModelAttestation`) and checks that the attested key equals the key pinned on-chain. The council pinned that key through a DAO vote. The contract then checks every signature against the pinned key.
- **Hardware and model:** Intel TDX / NVIDIA attestation, and the quality of the model's judgment. A forged document is still forged evidence; this is why the AI only recommends and the council decides.
- **Council:** during the hackathon the Sputnik DAO has **one member, our team account**. Its power is limited by J1–J3: it can only choose A or B, only for money in dispute, and every decision is public. Council actions on the public site need a passcode. An independent council is future work.
- **Court server:** availability only (§3).
- **Testnet:** `usdc.fakes.testnet` has an open mint. No real money is involved, and nothing here is claimed for mainnet.
- **Dev contract `nh-v1undo-mvz2j3bw.testnet` still has a key.** The public demo, Coba Curi and S25 instances are locked.

## 8. Not built (❌)

- Trusted contacts (instant final payments to established contacts) — designed, not built.
- Gasless panic via NEP-366 meta-transactions — the relayer pattern is proven in spike S10 ([`SPIKE_LOG.md`](SPIKE_LOG.md)), but it is not wired into the product.
- Pending transfers as transferable NFTs — design only.
- Image evidence (only text evidence today).
- Appeal keys: revealing your evidence to the council after a decision.
- Notifications outside the browser. The in-app alert shows only in a browser that holds the recovery account; the guard's Telegram hook exists but is not configured.
- Reproducible build (`cargo near build reproducible-wasm`).
- Multisig recovery accounts. Today, if both keys are stolen, Undo cannot tell the owner from the thief (threat A8, out of scope).
- Mainnet deployment.
- NEAR Intents (no testnet deployment exists).
