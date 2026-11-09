"use client";
// Full-screen "tape" effect shown after panic (❚❚ PAUSE), finalize (◀◀ REW) or unlock (▶ PLAY).
// It sets html[data-fx] for a moment (globals.css does the visuals) and shows a big OSD stamp.
// The stamp is decorative: the result is also written in the card's own message, so it is aria-hidden.
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { TIME_FX_EVENT, type TimeFx as Kind } from "@/lib/timefx";

const LENGTH: Record<Kind, number> = { stop: 1400, rewind: 1200, play: 700 };

export function TimeFx() {
  const t = useT();
  const [fx, setFx] = useState<{ kind: Kind; n: number } | null>(null);

  useEffect(() => {
    let clearHtml: ReturnType<typeof setTimeout> | undefined;
    let clearStamp: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      const kind = (e as CustomEvent<Kind>).detail;
      clearTimeout(clearHtml);
      clearTimeout(clearStamp);
      document.documentElement.dataset.fx = kind;
      setFx((p) => ({ kind, n: (p?.n ?? 0) + 1 }));
      clearHtml = setTimeout(() => delete document.documentElement.dataset.fx, LENGTH[kind]);
      clearStamp = setTimeout(() => setFx(null), 2200);
    };
    window.addEventListener(TIME_FX_EVENT, on);
    return () => {
      window.removeEventListener(TIME_FX_EVENT, on);
      clearTimeout(clearHtml);
      clearTimeout(clearStamp);
      delete document.documentElement.dataset.fx;
    };
  }, []);

  const stamp =
    fx?.kind === "stop"
      ? { big: "❚❚ PAUSE", small: t("waktu berhenti · uang dibekukan", "time stopped · money frozen") }
      : fx?.kind === "rewind"
        ? { big: "◀◀ REW", small: t("waktu mundur · uang kembali", "time rewound · money back") }
        : fx?.kind === "play"
          ? { big: "▶ PLAY", small: t("akun berjalan lagi", "the account runs again") }
          : null;

  return (
    <>
      <div className="fx-layer" aria-hidden="true" />
      {stamp && (
        <div className="fx-stamp" aria-hidden="true">
          <div
            key={fx!.n}
            className={`fx-stamp-box flex flex-col items-center gap-2 rounded-[22px] bg-tape/70 px-8 py-6 text-center backdrop-blur-md ${fx!.kind === "stop" ? "text-ice" : "text-sky"}`}
          >
            <span className="timer text-6xl leading-none sm:text-8xl">{stamp.big}</span>
            <span className="text-sm font-semibold text-ink sm:text-base">{stamp.small}</span>
          </div>
        </div>
      )}
    </>
  );
}
