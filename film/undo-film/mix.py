"""Undo film: voices + score + foley -> out/mix.wav (48 kHz stereo). Run with the library's venv:
   %USERPROFILE%/lemo-opuscar/.venv/Scripts/python.exe mix.py   (LIB env var or ~/lemo-opuscar)
Timings are the same numbers as film.part (VO, T_PRESS, T_RISE, T_STOP, T_REW, T_PLAY, T_COURT, T_REAL, T_CLOSE)."""
import os, sys, json
import numpy as np, soundfile as sf, soxr
HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.environ.get("LIB", os.path.expanduser("~/lemo-opuscar"))
sys.path.insert(0, os.path.join(LIB, "core", "audio"))
sys.path.insert(0, LIB)
import sfx
from sfx import SR, add
DUR = 96.0
T_PRESS, T_RISE, T_STOP = 11.2, 12.6, 24.3
T_REW, T_PLAY, T_COURT, T_REAL, T_CLOSE = 35.9, 39.2, 46.6, 58.6, 85.2
N = int(DUR * SR)
voice, music, fol = (np.zeros((N, 2), np.float32) for _ in range(3))
rng = np.random.default_rng(5)

# ---- voices ----
VO = {"t1": 3.2, "u1": 18.6, "u2": 26.8, "u3": 30.3, "u4": 36.4, "t2": 40.2, "t3": 43.4, "u5": T_COURT, "u6": 56.2,
      "u7": 60.6, "u8": 66.6, "t4": 71.3, "u9": 73.6, "u10": 79.8, "t5": 83.6, "u11": 87.6}
PAN = {"t": .25, "u": 0.0}
for k, t0 in VO.items():
    x, sr = sf.read(os.path.join(HERE, "voice", k + ".wav"), dtype="float32")
    if x.ndim > 1: x = x.mean(1)
    x = soxr.resample(x, sr, SR)
    x = sfx.compress(x / max(1e-6, np.abs(x).max()), thr=.3, ratio=3)
    add(voice, x / max(1e-6, np.abs(x).max()) * .8, t0, 1.0, PAN[k[0]])

# ---- instruments: real samples (VCSL, CC0) with small synth fallbacks ----
def tt(d): return np.arange(int(d * SR)) / SR
NOTE = lambda n: 440 * 2 ** ((n - 69) / 12)
def norm(x, k): x = np.asarray(x, np.float32); return x / max(1e-6, float(np.abs(x).max())) * k
def saw_bass(m, d, v=1.0, cut=500):
    t = tt(d); f = NOTE(m); x = 2 * ((t * f) % 1) - 1 + .5 * (2 * ((t * f * 2.003) % 1) - 1)
    x = sfx.lp(x, cut) * np.minimum(1, t / .005) * np.exp(-t / (d * .9)); return norm(x, v)
def pad(ms, d, v=1.0, att=.8, rel=1.2):
    t = tt(d); x = sum(np.sin(2 * np.pi * NOTE(m) * t + i) + .3 * np.sin(2 * np.pi * NOTE(m) * 2.002 * t) for i, m in enumerate(ms)) / len(ms)
    env = np.minimum(1, t / att) * np.minimum(1, (d - t) / rel).clip(0, 1); return (x * env * v).astype(np.float32)
def sweep(f0, f1, d, v=1.0):
    t = tt(d); f = f0 * (f1 / f0) ** (t / d); ph = 2 * np.pi * np.cumsum(f) / SR; env = np.minimum(1, t / .04) * np.minimum(1, (d - t) / .1)
    return (np.sin(ph) * env * v).astype(np.float32)
def buzz(d=.42, v=1.0):
    t = tt(d); x = np.sin(2 * np.pi * 150 * t) * (.6 + .4 * np.sign(np.sin(2 * np.pi * 32 * t))); return (x * np.minimum(1, t / .01) * np.minimum(1, (d - t) / .03) * v).astype(np.float32)
def revcym(d=1.0, v=1.0):
    t = tt(d); x = sfx.hp(sfx.noise(d), 3000) * (t / d) ** 3; return (x * v).astype(np.float32)
def subdrop(d=1.6, v=1.0):
    t = tt(d); f = 80 * (28 / 80) ** (t / d); ph = 2 * np.pi * np.cumsum(f) / SR; return (np.sin(ph) * np.exp(-t / .9) * v).astype(np.float32)
def crackle(d=.8, v=1.0):
    x = np.zeros(int(d * SR), np.float32)
    for _ in range(int(60 * d)):
        i = int(rng.random() * (len(x) - 400)); x[i:i + 400] += (sfx.hp(sfx.noise(400 / SR), 4000) * np.exp(-np.arange(400) / 60)).astype(np.float32) * (.3 + rng.random())
    return x * v
AV = set()
try:
    from core.audio import sampler as SM
    for n in ("tubular_bells", "vibraphone_bowed", "glockenspiel", "gran_cassa", "gong2", "sus_cymbal", "woodblock", "hand_chimes", "marimba", "toms", "clash", "frame_drum"):
        try: SM.load(n); AV.add(n)
        except Exception as e: print("  missing", n)
    SM.seed(11)
except Exception as e:
    print("sampler unavailable:", str(e)[:90])
print("instruments:", ", ".join(sorted(AV)) or "synth only")
HAVE = bool(AV)
def S_note(inst, m, d, vel=.8, k=1.0):
    return norm(SM.note(inst, m, d, vel=vel), k) if inst in AV else norm(pad([m], d, 1, .01, .3), k)
def S_hit(inst, idx=None, vel=.8, k=1.0, dur=None):
    if inst in AV:
        x = SM.hit(inst, idx, vel=vel, dur=dur) if idx is not None else SM.hit(inst, vel=vel, dur=dur); x = np.asarray(x, np.float32)
        if x.ndim > 1: x = x.mean(1)
        return norm(x, k)
    return norm(sfx.thump(1, 55), k)

BPM = 132; BEAT = 60 / BPM
# A. the hook: a clock that ticks the window down, a low pulse, an eerie little tune for the thief
t = .35; i = 0
while t < T_PRESS - .05:
    add(music, S_hit("woodblock", 0 if i % 4 == 0 else 1, .6, .32) if "woodblock" in AV else sfx.click(1.4, .3), t, 1, .3)            # the clock
    if t > 1.4:
        add(music, saw_bass([38, 38, 41, 36][(i // 4) % 4], BEAT * .48, .26, 380 + 40 * (i % 4)), t, 1, 0)
        add(music, saw_bass([38, 38, 41, 36][(i // 4) % 4], BEAT * .45, .18, 380), t + BEAT / 2, 1, 0)
    t += BEAT; i += 1
for j, (m, dt) in enumerate([(74, 0), (73, .5), (69, 1.0), (70, 1.5), (62, 2.25)] * 2):
    add(music, S_note("glockenspiel", m, .6, .45, .14), 3.0 + dt + (j // 5) * 3.7, 1, -.35)                                  # thief's motif
add(music, pad([50, 57, 62], 9.0, .08, 2.0, 1.0), 2.2, 1, 0)
# B. the press: everything cuts; two heartbeats
add(music, S_hit("gran_cassa", vel=.5, k=.35), 11.7, 1, 0); add(music, S_hit("gran_cassa", vel=.45, k=.3), 12.15, 1, 0)
add(music, revcym(1.0, .25), T_RISE - 1.0, 1, 0)
# C. the awakening: one huge hit, bells, a bowed-metal pad, toms driving forward
add(music, S_hit("gran_cassa", vel=1, k=.9), T_RISE, 1, 0); add(music, S_hit("gong2", vel=.9, k=.55), T_RISE, 1, 0); add(music, S_hit("sus_cymbal", vel=.9, k=.4), T_RISE, 1, 0)
add(music, subdrop(1.8, .6), T_RISE, 1, 0)
for j, m in enumerate([62, 66, 69, 74]): add(music, S_note("tubular_bells", m, 3.5, .7, .3), T_RISE + .1 + j * .12, 1, (j - 1.5) * .2)
for j, m in enumerate([62, 69, 74, 76]): add(music, S_note("vibraphone_bowed", m, 9.5, .6, .14), T_RISE + .3, 1, (j - 1.5) * .3)
add(music, pad([38, 45, 50, 57, 64], 11.0, .1, 1.0, 1.5), T_RISE, 1, 0)
t = T_UP = 14.2; i = 0
while t < 23.35:
    acc = i % 8 in (0, 3, 6)
    add(music, S_hit("toms", 0 if acc else 2, .9 if acc else .55, .45 if acc else .22), t, 1, -.1)
    if acc: add(music, S_hit("frame_drum", vel=.7, k=.25), t, 1, .2)
    if i % 2 == 0: add(music, saw_bass(38 + [0, 0, 5, 7][(i // 8) % 4], BEAT * .9, .2, 650), t, 1, 0)
    if i % 4 == 2: add(music, S_note("glockenspiel", [86, 90, 93, 88][(i // 4) % 4], .4, .5, .1), t, 1, .4)
    t += BEAT / 2; i += 1
add(music, S_hit("gran_cassa", vel=.9, k=.7), 15.6, 1, 0); add(music, S_hit("sus_cymbal", vel=.7, k=.3), 15.6, 1, 0)       # UNDO slam
# D. the stop: a reverse swell, the hand, one enormous low hit, then nothing but a cold hum
add(music, revcym(.9, .35), T_STOP - .9, 1, 0); add(music, sweep(200, 900, .9, .08), T_STOP - .9, 1, 0)
add(music, S_hit("gran_cassa", vel=1, k=1.0), T_STOP, 1, 0); add(music, subdrop(2.6, .9), T_STOP, 1, 0); add(music, S_hit("gong2", vel=1, k=.5), T_STOP + .05, 1, 0)
add(music, S_note("tubular_bells", 50, 5.0, .8, .35), T_STOP + .1, 1, 0)
add(music, S_note("vibraphone_bowed", 86, 6.0, .5, .05), T_STOP + 1.3, 1, .3); add(music, S_note("vibraphone_bowed", 81, 5.0, .5, .04), T_STOP + 1.8, 1, -.3)

# E. stopped time goes on: the cold hum holds under the walk
add(music, S_note("vibraphone_bowed", 74, 6.0, .45, .05), 30.0, 1, 0)
# F. the rewind: the score runs backwards, fast, with a tape squeal
seg = music[int(T_RISE * SR):int(T_STOP * SR)][::-1].copy()
seg = soxr.resample(seg, SR * 4, SR).astype(np.float32)[:int(3.1 * SR)]
add(music, seg.mean(1) * .32, T_REW, 1, 0)
def squeal(d, v=1.0):
    t = tt(d); f = 900 + 700 * np.sin(2 * np.pi * 7 * t) + 2200 * (t / d); ph = 2 * np.pi * np.cumsum(f) / SR
    return (np.sin(ph) * .35 * np.minimum(1, t / .05) * np.minimum(1, (d - t) / .2) * v).astype(np.float32)
add(music, squeal(3.0, .09), T_REW + .05, 1, 0)
# G. play again: warm, a light marimba groove under the thief's tricks
add(music, S_hit("clash", vel=.5, k=.2), T_PLAY, 1, 0)
for j, m in enumerate([62, 66, 69, 73]): add(music, S_note("vibraphone_bowed", m, 4.0, .55, .1), T_PLAY + .05, 1, (j - 1.5) * .3)
t = T_PLAY + .3; i = 0
while t < T_COURT - .3:
    add(music, S_note("marimba", [62, 69, 66, 69, 64, 71, 67, 71][i % 8], .3, .6, .16), t, 1, [-.3, .3][i % 2])
    if i % 4 == 0: add(music, saw_bass([38, 38, 40, 43][(i // 8) % 4], .4, .15, 450), t, 1, 0)
    t += BEAT / 2; i += 1
# H. the court: a low hum, a heartbeat on the frame drum, two chimes for the two votes
add(music, pad([33, 40, 45], 10.4, .12, 1.2, 1.5), T_COURT - .4, 1, 0)
for j in range(9): add(music, S_hit("frame_drum", vel=.55, k=.18), T_COURT + .2 + j * .9, 1, 0)
add(music, S_note("hand_chimes", 86, 2.0, .7, .3), 50.55, 1, -.3); add(music, S_note("hand_chimes", 90, 2.0, .7, .3), 51.15, 1, .3)
add(music, S_note("tubular_bells", 74, 3.0, .6, .25), 53.3, 1, 0)
# I. this part is real: steady and bright, toms and marimba, a tick on every panel change
add(music, sweep(300, 1200, .9, .08), 57.4, 1, 0); add(music, S_hit("gran_cassa", vel=.8, k=.6), T_REAL, 1, 0); add(music, S_hit("clash", vel=.7, k=.25), T_REAL, 1, 0)
t = T_REAL + .1; i = 0
while t < 83.2:
    if i % 4 == 0: add(music, S_hit("toms", 1, .6, .2), t, 1, -.1)
    add(music, S_note("marimba", [74, 78, 81, 78][i % 4] + [0, 0, 2, -3][(i // 16) % 4], .25, .5, .09), t, 1, [-.35, .35][i % 2])
    if i % 8 == 0: add(music, saw_bass([38, 38, 40, 35][(i // 16) % 4], .7, .16, 520), t, 1, 0)
    t += BEAT / 2; i += 1
# J. the close: one big chord, bells up, then out
add(music, S_hit("gran_cassa", vel=.9, k=.75), 85.75, 1, -.2); add(music, S_hit("gran_cassa", vel=.9, k=.75), 86.3, 1, .2)
for j, m in enumerate([50, 57, 62, 66, 69, 74]): add(music, S_note("tubular_bells", m, 6.0, .7, .22), 87.2 + j * .1, 1, (j - 2.5) * .15)
for j, m in enumerate([62, 69, 74, 78]): add(music, S_note("vibraphone_bowed", m, 8.0, .6, .14), 87.0, 1, (j - 1.5) * .3)
add(music, pad([38, 45, 50, 57, 62], 9.0, .12, 1.0, 2.5), 86.8, 1, 0)

# ---- foley ----
for b in (.25, .95, 7.7): add(fol, buzz(.42, .5), b, 1, -.3)                                                              # phone buzz
add(fol, sfx.whoosh(1.2, .35), 1.45, 1, .5)                                                                               # the thief appears
for i in range(72):                                                                                                       # coins leave the phone
    t0 = 1.5 + i * .3
    if t0 >= T_STOP: break
    add(fol, S_note("glockenspiel", 96 + int(rng.integers(0, 5)), .25, .35, .045), t0, 1, -.5 + rng.random() * .3)
add(fol, sfx.click(1.0, .9), T_PRESS, 1, -.2); add(fol, sfx.pop(.4), T_PRESS + .02, 1, -.2)                               # the press
add(fol, crackle(.9, .35), 12.2, 1, 0)                                                                                    # frost on the phone
add(fol, sfx.crash(.5), T_RISE, 1, 0); add(fol, sfx.whoosh(1.6, .7), T_RISE, 1, 0); add(fol, crackle(1.4, .5), T_RISE + .05, 1, 0)
for j in range(5): add(fol, sfx.click(2.0 + j * .1, .25), 17.6 + j * .22, 1, -.5)                                         # spec card rows
add(fol, sfx.whoosh(.4, .3), 18.9, 1, .3)                                                                                 # the point
add(fol, sfx.whoosh(.5, .5), T_STOP - .15, 1, 0); add(fol, crackle(2.0, .5), T_STOP + 1.1, 1, 0)                          # freeze
add(fol, sfx.whoosh(1.2, .3), 34.5, 1, .3)                                                                                # the point
for j in range(30): add(fol, S_note("glockenspiel", 100 - j % 7, .2, .3, .03), T_REW + .1 + j * .1, 1, -.4 + (j % 5) * .2)  # coins flying home
add(fol, sfx.click(1.2, .8), T_PLAY, 1, 0)
add(fol, sfx.pop(.4), 40.4, 1, .4)                                                                                         # the empty hand
for j in range(5): add(fol, sfx.click(.7, .35 if j % 2 else .15), 43.55 + j * .1, 1, .5)                                  # the sign flickers on
add(fol, sfx.whoosh(.8, .35), 47.4, 1, -.4); add(fol, sfx.whoosh(.8, .35), 47.9, 1, .4)                                  # evidence flies in
add(fol, crackle(.5, .3), 49.4, 1, -.1); add(fol, crackle(.5, .3), 49.8, 1, .1)                                          # sealed
add(fol, sweep(400, 1600, 2.2, .05), 49.7, 1, 0)                                                                         # the eye reads
add(fol, sfx.whoosh(1.4, .3), 53.3, 1, -.3)                                                                              # the coin goes home
add(fol, sfx.whoosh(1.6, .5), 55.6, 1, 0)                                                                                # into the phone
for b in (66.2, 73.2, 79.4): add(fol, sfx.click(1.6, .45), b, 1, 0)                                                      # next panel
add(fol, S_hit("woodblock", 0, .8, .5), 71.25, 1, .4); add(fol, sweep(900, 300, .5, .12), 71.35, 1, .4)                 # "21?!"
add(fol, sfx.whoosh(.4, .25), 83.95, 1, .4); add(fol, S_hit("clash", vel=.6, k=.4), 84.4, 1, .4); add(fol, crackle(.9, .5), 84.4, 1, .4)   # the key breaks
add(fol, sfx.thump(.9, 55), 85.75, 1, -.2); add(fol, sfx.thump(.9, 55), 86.3, 1, .2)                                    # the keys land

# ---- mix: duck the music under the voice, a short room on the music ----
env = np.abs(voice).max(1); k = int(.08 * SR); env = np.convolve(env, np.ones(k) / k, "same"); env = np.clip(env / .12, 0, 1)
duck = 1 - .74 * np.convolve(env, np.ones(int(.25 * SR)) / int(.25 * SR), "same").clip(0, 1)
if HAVE:
    try: music = SM.room(music, size=.55, mix=.22)
    except Exception: pass
# the press is a real silence: nothing but the heartbeats between T_PRESS+.1 and T_RISE-1.0
gate = np.ones(N, np.float32); a, b = int((T_PRESS + .12) * SR), int((T_RISE - 1.0) * SR); gate[a:b] = 0; gate[a - 2400:a] = np.linspace(1, 0, 2400)
hb = np.zeros_like(music); add(hb, S_hit("gran_cassa", vel=.5, k=.35), 11.7, 1, 0); add(hb, S_hit("gran_cassa", vel=.45, k=.3), 12.15, 1, 0)
music = music * gate[:, None] + hb
g2 = np.ones(N, np.float32); a2, b2 = int(83.25 * SR), int(85.7 * SR); g2[a2:b2] = 0; g2[a2 - 4800:a2] = np.linspace(1, 0, 4800); g2[b2:b2 + 480] = np.linspace(0, 1, 480)
music = music * g2[:, None]
mix = voice * 1.12 + music * duck[:, None] * .85 + fol * .75
fade = np.minimum(1, (DUR - np.arange(N) / SR) / 1.2).clip(0, 1); mix *= fade[:, None]
for c in range(2): mix[:, c] = sfx.limit(mix[:, c], .92)
os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
sf.write(os.path.join(HERE, "out", "mix.wav"), mix, SR)
print("mix.wav", round(len(mix) / SR, 2), "s, peak", round(float(np.abs(mix).max()), 3))
