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
      <summary className="osd inline-flex cursor-pointer list-none items-center gap-1.5 text-lg leading-6 text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="inline-block transition-transform group-open:rotate-90">
          ▶
        </span>
        {label ?? t("Selengkapnya", "More")}
      </summary>
      <div className="mt-2 space-y-2 border-l-2 border-line pl-3">{children}</div>
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
    <span aria-hidden className="relative inline-block h-2 w-24 shrink-0 overflow-hidden rounded-[1px] bg-ink/10 align-middle sm:w-36">
      <span className={`absolute inset-y-0 left-0 transition-[width] duration-1000 ease-linear ${tone === "ice" ? "bg-ice" : "bg-signal"}`} style={{ width: `${left * 100}%` }} />
    </span>
  );
}

/** Progress through steps. `current` = index of the active step (all earlier ones are done; steps.length = all done). */
export function Stepper({ steps, current }: { steps: { icon: string; label: string }[]; current: number }) {
  return (
    <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "now" : "todo";
        return (
          <li key={i} aria-current={state === "now" ? "step" : undefined} className="min-w-0">
            <div className={`h-1.5 rounded-[1px] ${state === "done" ? "bg-phosphor" : state === "now" ? "bg-signal" : "bg-ink/15"}`} />
            <div className={`osd mt-1.5 flex items-center gap-1 text-base leading-5 ${state === "done" ? "text-phosphor" : state === "now" ? "text-signal" : "text-muted"}`}>
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
    <div className="rounded-[3px] border border-line bg-panel p-4 sm:p-5">
      <h3 className="osd rgb mb-3 text-2xl leading-none">
        <span aria-hidden className={accent}>
          ▌
        </span>
        {title}
      </h3>
      <ol className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        {panels.map((p, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <li aria-hidden className={`osd self-center text-2xl leading-none ${accent} rotate-90 sm:rotate-0`}>
                ▶
              </li>
            )}
            <li className={`flex flex-1 items-center gap-3 rounded-[2px] border bg-well p-3 sm:flex-col sm:text-center ${p.hot ? (tone === "rec" ? "border-rec/70" : "border-plum/70") : "border-line"}`}>
              <span aria-hidden className="text-3xl leading-none sm:text-4xl">
                {p.icon}
              </span>
              <span className="text-sm font-bold leading-snug text-ink">{p.text}</span>
            </li>
          </Fragment>
        ))}
      </ol>
    </div>
  );
}
