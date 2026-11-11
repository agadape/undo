# Undo: "Five Minutes" (treatment, draft 2)

A 3D film made in code (three.js, rendered frame by frame), about 100 s, English voice and subtitles.
Draft 1 (cute capsule characters in an arena, giant screen) was dropped: too close to the Laurel film, which goes out on
the same X account. This draft keeps nothing from it but the method.

## Idea

An anime "power reveal", told with Undo's own pieces. Your phone gets the alert. You press PANIC.
A guardian rises out of the phone with two powers that are exactly what the contract does:
**❚❚ stop time** (freeze a theft inside its window) and **◀◀ rewind** (send the money home, no vote).

Inspiration, grammar only: battle-anime guardian spirits, a time stop where everything hangs frozen and only the guardian
moves, a rewind played backwards with tape sounds. No names, characters, designs or catchphrases from any existing work.

## Logline

A thief takes your key and drains your wallet; "in crypto, every transfer is final." You press PANIC on your phone and
your wallet's guardian stops time, walks through the frozen coins, and rewinds them home.

## The everyday comparison

**The undo button.** Every app has Ctrl+Z; crypto never had one. The tape (VHS, the site's theme) is the five-minute window.

## Cast

| Name | Look | Stands for | Voice (Kokoro) |
|---|---|---|---|
| UNDO | A tall guardian of frosted ice armour. Cassette visor with two glowing reels, ◀◀ ❚❚ on its chest, a cape of magnetic tape. Floats; legs fade to frost | The product. Speaks rarely, calm | low, calm |
| THE THIEF | A hooded phantom of red glass shards, a white mask with slit eyes and a grin, your stolen key in one hand | A thief with your key | smug |
| YOUR PHONE | Floats in the dark; its screen is the real app (the alert, the frozen wallet, the proof) | You, the owner, and the recovery account | — |
| THE COINS | A river of glass coins with the site's ↺$ mark | Your 100 rUSDC | — |

## Structure

| # | Beat | What happens | Time |
|---|---|---|---|
| 1 | Hook | Your phone buzzes: "Money is leaving. Was this you?" Coins stream out of it toward the thief. "Your key. Your money. In crypto, every transfer is final." Amber clock 4:52 | 0–10 s |
| 2 | PANIC | Close on the phone: the thumb hits **No — PANIC**. Silence | 10–14 s |
| 3 | Awakening | Frost bursts out of the phone; the guardian rises, speed lines, low angle. Its spec card slams in: ❚❚ PAUSE · ◀◀ REWIND · range 5 minutes · moves money only back to you · its own keys 0. "Final? Not for five minutes." | 14–24 s |
| 4 | Time stop | A sphere spreads from its chest; inside, every colour turns to its negative; then the world settles into frozen ice. Coins hang in the air, the thief stuck mid-grab. The guardian walks between the coins and turns to us: "Time's stopped. Only you and I can see this." The rule, in one line | 24–42 s |
| 5 | Rewind | ◀◀ The whole scene runs backwards (VHS lines, tape squeal): the coins fly back into the phone, the thief is dragged away. "No judge. No vote. Just: back." ▶ Colour returns. Thief: "…Where'd it go?" | 42–56 s |
| 6 | Second trick | The thief tries a fake shop. Report: evidence sealed in ice, read by an AI inside a black box nobody can open; three lights, two decide. "The AI can't move a cent." | 56–68 s |
| 7 | This part is real | Close on the phone: the real app. A real gasless panic; the bait wallet the guard froze in 21 s; the AI that caught a hidden instruction; a contract with 0 keys | 68–90 s |
| 8 | Close | The thief gives up. The guardian behind two glass keys, Ctrl and Z (the site's hero). "Ctrl+Z for USDC." URL, BUILT AT NEAR HACKATHON | 90–100 s |

Signature moves: the inverted time-stop sphere, and the rewind, which is literal (the page can draw any moment, so the scene really runs backwards).

## Script (as recorded; every line passes speech-to-text, lines that were misheard were rewritten)

1. THIEF: Your key. Your money. In crypto, every transfer is final.
2. (no line: the phone, the PANIC button, silence)
3. UNDO: Final? Not for five minutes.
4. UNDO: Time has stopped. Only you and I can see this. · UNDO: Every transfer waits five minutes. Until then, nothing is final. Not even for him.
5. UNDO: No judge. No vote. Just: back. · THIEF: Hey. Where did it go?
6. THIEF: Fine. I'm a store now. Pay up. · UNDO: Got scammed? Hit report. A private AI reads both sides, sealed. Three people decide. The AI can't move a cent.
7. UNDO: That was a story. This part is real. · UNDO: A real panic, on the NEAR test network. We paid the gas, not your phone. · UNDO: We set a trap wallet and tried to rob it. Frozen in 21 seconds. · THIEF: 21?! · UNDO: A fake seller slipped a secret order to the AI judge. It noticed. · UNDO: The contract has no keys. Not even we can change it. · THIEF: I quit.
8. UNDO: Undo. Control Z, for your money.

## What the phone shows (real, checkable)

| Screen | Source |
|---|---|
| The alert: "Money is leaving Main wallet. Was this you?" 90.00 rUSDC → undo-sngqnx.testnet, Yes / No — PANIC | the app's alert, demo wallet undo-0092ci.testnet (9 Nov test run) |
| Frozen 100.00 rUSDC, "Gasless: paid by the Undo relayer", recovery NEAR 10.000000 → 10.000000 | v2 production panic `59goVnnPt1KxLAWYxjPjJQwPdBqqtCXZqQbCdaMXwrYG` (CLAIMS §2) |
| Coba Curi: bait 1,000 rUSDC, cashed out 0.00, frozen 21 s after the transfer | panic `DaN7WLrt8LzaFkj7JpztsWYddfv1LiG4gJzUNTpUgRYr` (CLAIMS §4) |
| Case #4: `kembalikan`, confidence 85, `curiga_injeksi: true`; council 2 of 3 → Reversed | `5qChMdoWVfEmUkRFWe2de6QTd7wNFpU1CLa33pQFMe4v`, `26G1vz5z7TF3DAUpKDy6WjccVJF9nePbJ7uRH3db8WgM` (CLAIMS §3) |
| /janji: 0 access keys, reproducible v2 build, reserve 1:1 | `undo-demo-v2.testnet`, code hash `AzDhXsj2…` (CLAIMS §1, §6) |

## Variables

- `KEY_PUBLIC`: if the Coba Curi bait key is published before the final render, beat 7 adds "Its key is public. Go ahead."
- `CC_ATTEMPTS`: read from /coba-curi on the day of the final render.
- "Five minutes" is the public demo's window (intended product setting: 24 h), the same numbers the site uses.

## Look

The site's world, not an arena: a wet black plain in fog under one cold spotlight, the VCR's glyphs (▶ ❚❚ ◀◀ ■) hanging far
back in the dark, frost (the site's frost.webp). Ice blue #9fe8ff / #8fdcff for Undo, PANIC red #ff2e4d only for the thief and
the button, pending amber #ffb224 for the clock. Type: Archivo expanded (titles, the spec card), Archivo (subtitles as a VCR
on-screen display with a coloured bar, not pills), JetBrains Mono (hashes). Camera: low angles, push-ins, a dolly through the
frozen coins. Post: 2× supersampling, depth of field, bloom, our own pass for the inversion sphere, the ice grade, VHS and speed lines.
