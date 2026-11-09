"use client";
// Visual aids: show the flow instead of describing it. Long explanations go behind <More>.
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** "▶ More": details for whoever wants them, out of the way for everyone else. */
export function More({ children, label }: { children: ReactNode; label?: string }) {
  const t = useT();
  return (
    <details className="group mt-3 text-sm text-dim">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold leading-6 text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="inline-block text-[0.7em] transition-transform group-open:rotate-90">
          ▶
        </span>
        {label ?? t("Selengkapnya", "More")}
      </summary>
      <div className="mt-2 max-w-[68ch] space-y-2 pl-4">{children}</div>
    </details>
  );
}

/** The undo window as a bar that drains: full when the transfer is sent, empty when it is final. */
export function WindowBar({ from, to, tone = "signal" }: { from: string; to: string; tone?: "signal" | "ice" }) {
  const now = useNow();
  const start = Number(BigInt(from) / 1_000_000n);
  const end = Number(BigInt(to) / 1_000_000n);
  const left = Math.max(0, Math.min(1, (end - now) / Math.max(1, end - start)));
  return (
    <span aria-hidden className="relative inline-block h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-ink/10 align-middle sm:w-36">
      <span className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-linear ${tone === "ice" ? "bg-ice" : "bg-signal"}`} style={{ width: `${left * 100}%` }} />
    </span>
  );
}

/** Progress through steps, drawn as one tape with a dot per stop.
 *  `current` = index of the active step (all earlier ones are done; steps.length = all done). */
export function Stepper({ steps, current }: { steps: { icon: string; label: string }[]; current: number }) {
  return (
    <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "now" : "todo";
        return (
          <li key={i} aria-current={state === "now" ? "step" : undefined} className="min-w-0">
            <div className={`h-1 rounded-full ${state === "done" ? "bg-sky" : state === "now" ? "bg-signal" : "bg-ink/12"}`} />
            <div className={`mt-2 flex items-center gap-1 text-sm font-semibold leading-5 ${state === "done" ? "text-sky" : state === "now" ? "text-signal" : "text-muted"}`}>
              <span aria-hidden>{state === "done" ? "✓" : s.icon}</span>
              {/* On a phone only the active step keeps its label. */}
              <span className={`truncate ${state === "now" ? "" : "sr-only sm:not-sr-only"}`}>{s.label}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** A scenario as three comic panels: big icon, a few words each. */
export function Strip({ title, tone, panels }: { title: string; tone: "rec" | "plum"; panels: { icon: string; text: string; hot?: boolean }[] }) {
  const accent = tone === "rec" ? "text-rec" : "text-plum";
  return (
    <div>
      <h3 className="serif mb-4 text-2xl leading-tight">{title}</h3>
      <ol className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-stretch">
        {panels.map((p, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <li aria-hidden className={`self-center text-sm leading-none ${accent} rotate-90 sm:rotate-0`}>
                ▶
              </li>
            )}
            <li className={`flex flex-1 items-center gap-3 rounded-[14px] p-4 sm:flex-col sm:text-center ${p.hot ? (tone === "rec" ? "bg-rec/12" : "bg-plum/12") : "bg-panel"}`}>
              <span aria-hidden className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink/6 text-xl leading-none ${p.hot ? accent : "text-ink"}`}>
                {p.icon}
              </span>
              <span className="text-sm font-semibold leading-snug text-ink">{p.text}</span>
            </li>
          </Fragment>
        ))}
      </ol>
    </div>
  );
}
