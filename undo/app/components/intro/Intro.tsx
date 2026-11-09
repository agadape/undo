"use client";
// Home intro (design help: Dex Bennett). Three acts in one cold glass world:
//   1. trailer: a glass coin flies in, frost slows it to a stop, it cracks and shatters into frozen smoke;
//   2. hero: the shards hang in the air under the frozen headline; Ctrl+Z (glass keys or the real keyboard) brings the coin back;
//   3. PANIC practice run: a 3D red button; start a fake theft, hit PANIC before five minutes run out.
// Text is HTML (sharp, translatable, readable without WebGL). The 3D lives in ./scene.ts and is loaded only in the browser.
// Nothing here talks to the chain; the practice run is labelled as a browser simulation and links to the real one.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { btnClass } from "@/components/ui";
import { useT } from "@/lib/i18n";
import type { IntroApi, IntroCopy, RigFx } from "./scene";

type Phase = "idle" | "theft" | "frozen" | "back" | "gone";
const SPEED = 12; // the practice clock runs 12x so a visitor sees it move

export function Intro() {
  const t = useT();
  const trailer = useRef<HTMLElement>(null);
  const panic = useRef<HTMLElement>(null);
  const canvasA = useRef<HTMLCanvasElement>(null);
  const canvasB = useRef<HTMLCanvasElement>(null);
  const l1 = useRef<HTMLParagraphElement>(null);
  const l2 = useRef<HTMLParagraphElement>(null);
  const l3 = useRef<HTMLParagraphElement>(null);
  const hero = useRef<HTMLHeadingElement>(null);
  const heroUi = useRef<HTMLDivElement>(null);
  const keyC = useRef<HTMLSpanElement>(null);
  const keyZ = useRef<HTMLSpanElement>(null);
  const cap = useRef<HTMLParagraphElement>(null);
  const toast = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLDivElement>(null);
  const clockT = useRef<HTMLElement>(null);
  const clockS = useRef<HTMLSpanElement>(null);
  const frost = useRef<HTMLDivElement>(null);
  const fog = useRef<HTMLDivElement>(null);
  const skip = useRef<HTMLButtonElement>(null);

  const copy = useRef<IntroCopy>({ capIdle: "", capDone: "", clockRun: "", clockFrozen: "" });
  copy.current = {
    capIdle: t("Tekan Ctrl+Z. Lihat uangmu kembali.", "Press Ctrl+Z. Watch your money come back."),
    capDone: t("Sudah kembali. Tekan lagi untuk melihat pencuriannya.", "It's back. Press again to watch the theft."),
    clockRun: t("sampai final", "until it is final"),
    clockFrozen: t("membeku", "frozen"),
  };
  const fx = useRef<RigFx>({ armed: false, press: 0, frozen: 0, burst: -1 });
  const api = useRef<IntroApi | null>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    let gl = false;
    try {
      gl = !!document.createElement("canvas").getContext("webgl2");
    } catch {
      gl = false;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !gl) {
      setStill(true);
      return;
    }
    let alive = true;
    import("./scene").then(async (m) => {
      const need = [trailer, panic, canvasA, canvasB, l1, l2, l3, hero, heroUi, keyC, keyZ, cap, toast, clock, clockT, clockS, frost, fog, skip];
      if (!alive || need.some((r) => !r.current)) return;
      const a = await m.startIntro(
        {
          trailer: trailer.current!,
          panic: panic.current!,
          canvasA: canvasA.current!,
          canvasB: canvasB.current!,
          lines: [l1.current!, l2.current!, l3.current!],
          hero: hero.current!,
          heroUi: heroUi.current!,
          keyC: keyC.current!,
          keyZ: keyZ.current!,
          cap: cap.current!,
          toast: toast.current!,
          clock: clock.current!,
          clockT: clockT.current!,
          clockS: clockS.current!,
          frost: frost.current!,
          fog: fog.current!,
          skip: skip.current!,
        },
        copy,
        fx.current,
      );
      if (!alive) a.stop();
      else api.current = a;
    });
    return () => {
      alive = false;
      api.current?.stop();
      api.current = null;
    };
  }, []);

  // ---------- PANIC practice run ----------
  const [phase, setPhase] = useState<Phase>("idle");
  const [hint, setHint] = useState(false);
  const left = useRef(300);
  const timeEl = useRef<HTMLElement>(null);
  const barEl = useRef<HTMLElement>(null);
  useEffect(() => {
    fx.current.armed = phase === "theft";
    fx.current.frozen = phase === "frozen" || phase === "back" ? 1 : 0;
    if (phase !== "theft") return;
    let raf = 0,
      last = performance.now();
    const tick = (now: number) => {
      left.current = Math.max(0, left.current - ((now - last) / 1000) * SPEED);
      last = now;
      const s = Math.ceil(left.current);
      if (timeEl.current) timeEl.current.textContent = `0${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      if (barEl.current) barEl.current.style.width = `${(1 - left.current / 300) * 100}%`;
      if (left.current <= 0) setPhase("gone");
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);
  useEffect(() => {
    if (phase !== "frozen") return;
    const id = setTimeout(() => setPhase("back"), 2800);
    return () => clearTimeout(id);
  }, [phase]);
  const steal = () => {
    setHint(false);
    left.current = 300;
    if (timeEl.current) timeEl.current.textContent = "05:00";
    if (barEl.current) barEl.current.style.width = "0";
    setPhase(phase === "idle" ? "theft" : "idle");
  };
  const press = useCallback(() => {
    fx.current.press = 1;
    if (phase === "theft") {
      fx.current.burst = 0;
      setPhase("frozen");
    } else if (phase === "idle") setHint(true);
  }, [phase]);

  const msg: Record<Phase, [string, string]> = {
    idle: [t("Dompetmu tenang. 100.00 rUSDC tersedia.", "Your wallet is quiet. 100.00 rUSDC available."), hint ? t("Belum ada yang keluar. Tekan Simulasikan pencurian dulu.", "Nothing is leaving yet. Press Simulate theft first.") : t("Mulai pencuriannya, lalu hentikan.", "Start the theft, then stop it.")],
    theft: [t("Uang keluar dari Main wallet. Ini kamu?", "Money is leaving Main wallet. Was this you?"), t("40.00 rUSDC ke akun yang belum pernah kamu bayar.", "40.00 rUSDC to an account you have never paid.")],
    frozen: [t("Membeku. Pencuri tidak dapat apa-apa.", "Frozen. The thief gets nothing."), t("40.00 rUSDC menuju akun pemulihanmu.", "40.00 rUSDC is on its way to your recovery account.")],
    back: [t("100.00 rUSDC kembali ke Main wallet.", "100.00 rUSDC is back in Main wallet."), t("Lima menit, satu tombol. Itulah Undo.", "Five minutes, one button. That is Undo.")],
    gone: [t("Terlambat. Transfernya sudah final.", "Too late. The transfer is final."), t("Di dompet biasa, setiap transfer seperti ini.", "On a normal wallet, this is every transfer.")],
  };
  const stealLabel = phase === "idle" ? t("Simulasikan pencurian", "Simulate theft") : phase === "theft" || phase === "frozen" ? t("Ulang dari awal", "Start over") : t("Coba lagi", "Try again");

  return (
    <div className="intro" data-still={still || undefined}>
      <div className="intro-plate" aria-hidden />

      <section ref={trailer} className="intro-trailer" aria-label="Ctrl+Z for USDC">
        <div className="intro-stage">
          <div className="intro-words">
            <p ref={l1} className="intro-line serif ice-text">
              {t("Uang pindah ", "Money moves ")}
              <span className="cold">{t("sekejap mata.", "in a blink.")}</span>
            </p>
            <p ref={l2} className="intro-line serif ice-text" style={{ opacity: 0 }}>
              {t("Undo membuat tiap transfer ", "Undo makes every transfer ")}
              <span className="cold">{t("menunggu lima menit.", "wait five minutes.")}</span>
            </p>
            <p ref={l3} className="intro-line serif ice-text" style={{ opacity: 0 }}>
              {t("Bukan kamu? Tekan ", "Not you? Hit ")}
              <span className="hot">PANIC.</span> {t("Uangnya membeku.", "It freezes.")}
            </p>
            <h1 ref={hero} className="intro-hero serif ice-text" style={{ opacity: 0 }}>
              Ctrl+Z {t("untuk", "for")} USDC.
            </h1>
          </div>
          <canvas ref={canvasA} className="intro-canvas" aria-hidden />
          <div ref={frost} className="intro-frost" aria-hidden />
          <div ref={fog} className="intro-fog" aria-hidden />
          <div ref={clock} className="intro-clock glass-flat" style={{ opacity: 0 }}>
            <b ref={clockT} className="timer">
              05:00
            </b>
            <span ref={clockS}>{copy.current.clockRun}</span>
          </div>
          <div ref={toast} className="intro-toast glass-flat" role="status">
            <b className="timer text-ice">100.00 rUSDC</b> {t("kembali ke Main wallet.", "is back in Main wallet.")}
          </div>
          <div ref={heroUi} className="intro-heroui" style={{ opacity: 0 }}>
            <button type="button" className="intro-keys" onClick={() => api.current?.undo()} aria-label={t("Batalkan pencurian (Ctrl+Z)", "Undo the theft (Ctrl+Z)")}>
              <span ref={keyC} />
              <span ref={keyZ} />
            </button>
            <p ref={cap} className="intro-cap glass-flat">
              {copy.current.capIdle}
            </p>
            <Link href="/dompet" className={btnClass("primary")}>
              {t("Coba dompet demo", "Try the demo wallet")}
            </Link>
          </div>
          <button ref={skip} type="button" className={`intro-skip ${btnClass("ghost", true)}`} onClick={() => api.current?.skip()}>
            {t("Lewati intro", "Skip intro")}
          </button>
        </div>
      </section>

      <section ref={panic} className="intro-panic" aria-labelledby="try-steal">
        <div className="intro-stage">
          <div className="intro-ptop">
            <h2 id="try-steal" className="serif ice-text">
              {t("Coba ", "Try to ")}
              <span className="hot">{t("curi.", "steal it.")}</span>
            </h2>
            <p>{t("Pencuri mengirim 40 rUSDC dari dompetmu. Kamu punya lima menit. Tekan tombol merah sebelum waktunya habis.", "A thief sends 40 rUSDC out of your wallet. You have five minutes. Hit the red button before they run out.")}</p>
          </div>
          <canvas ref={canvasB} className="intro-canvas" aria-hidden />
          <button type="button" className="intro-dome" onClick={press} aria-label="PANIC" />
          <div className="intro-pbottom">
            <div className={`intro-alert glass-flat ${phase === "theft" ? "hot" : phase === "frozen" || phase === "back" ? "cold" : ""}`} aria-live="polite">
              <span className="font-bold">{msg[phase][0]}</span>
              {(phase === "theft" || phase === "frozen") && (
                <span className="flex items-center gap-3">
                  <b ref={timeEl} className="timer text-2xl leading-none">
                    05:00
                  </b>
                  <span className="intro-bar">
                    <i ref={barEl} />
                  </span>
                </span>
              )}
              <span className="text-sm text-dim">{msg[phase][1]}</span>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" className={btnClass("ghost")} onClick={steal}>
                {stealLabel}
              </button>
              <Link href="/coba-curi" className={btnClass("primary")}>
                {t("Coba di testnet", "Do it on testnet")}
              </Link>
            </div>
            <p className="max-w-[56ch] text-center text-xs text-muted">
              {t("Latihan ini berjalan di peramban. Dompet demo melakukan hal yang sama dengan uang uji sungguhan di NEAR testnet.", "This practice run happens in your browser. The demo wallet does the same thing with real test money on NEAR testnet.")}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
