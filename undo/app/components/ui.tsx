"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TX } from "@/lib/config";

export function Card({ title, children, right, tone }: { title?: ReactNode; children: ReactNode; right?: ReactNode; tone?: "danger" | "accent" }) {
  const ring =
    tone === "danger"
      ? "border-red-300 dark:border-red-900"
      : tone === "accent"
        ? "border-emerald-300 dark:border-emerald-900"
        : "border-stone-200 dark:border-stone-800";
  return (
    <section className={`rounded-xl border ${ring} bg-white p-4 shadow-sm dark:bg-stone-900`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

type BtnProps = { children: ReactNode; onClick?: () => void | Promise<void>; variant?: "primary" | "danger" | "ghost"; disabled?: boolean; small?: boolean; title?: string };
export function Button({ children, onClick, variant = "primary", disabled, small, title }: BtnProps) {
  const [busy, setBusy] = useState(false);
  const base = small ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm";
  const color =
    variant === "danger"
      ? "bg-red-600 text-white hover:bg-red-700"
      : variant === "ghost"
        ? "border border-stone-300 bg-transparent hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
        : "bg-emerald-700 text-white hover:bg-emerald-800";
  return (
    <button
      title={title}
      disabled={disabled || busy}
      onClick={async () => {
        if (!onClick) return;
        setBusy(true);
        try {
          await onClick();
        } finally {
          setBusy(false);
        }
      }}
      className={`${base} ${color} rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {busy ? "…" : children}
    </button>
  );
}

const STATUS: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  Frozen: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  Disputed: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  Settled: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  Reversed: "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200",
};
const LABEL: Record<string, string> = { Pending: "Pending", Frozen: "Dibekukan", Disputed: "Sengketa", Settled: "Final", Reversed: "Dibatalkan" };

export function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[status] ?? ""}`}>{LABEL[status] ?? status}</span>;
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "danger" | "ok" }) {
  const c =
    tone === "danger"
      ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
      : tone === "ok"
        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
        : "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
}

export function TxLink({ hash, label }: { hash?: string; label?: string }) {
  if (!hash) return null;
  return (
    <a className="mono text-xs text-emerald-700 underline dark:text-emerald-400" href={TX(hash)} target="_blank" rel="noreferrer">
      {label ?? `${hash.slice(0, 8)}…`}
    </a>
  );
}

/** Live countdown to a nanosecond timestamp. */
export function Countdown({ ns, done = "lewat" }: { ns: string | null | undefined; done?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!ns) return null;
  const left = Math.floor(Number(BigInt(ns) / 1_000_000n - BigInt(now)) / 1000);
  if (left <= 0) return <span className="text-stone-500">{done}</span>;
  const m = Math.floor(left / 60);
  const s = left % 60;
  return <span className="mono tabular-nums">{m > 0 ? `${m}m ${s}s` : `${s}s`}</span>;
}

/** Re-run an async loader every `ms`; returns the latest value and a manual refresh. */
export function usePoll<T>(load: () => Promise<T>, deps: unknown[], ms = 6000): [T | undefined, () => void, string | undefined] {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState<string>();
  const loadRef = useRef(load);
  loadRef.current = load;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const run = () =>
      loadRef
        .current()
        .then((v) => alive && (setValue(v), setError(undefined)))
        .catch((e) => alive && setError(String(e?.message ?? e)));
    run();
    // Skip polls while the tab is hidden (saves the free RPC quota).
    const t = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) run();
    }, ms);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, ms]);
  return [value, () => setTick((x) => x + 1), error];
}

export function Notice({ kind, children }: { kind: "ok" | "error" | "info"; children: ReactNode }) {
  const c =
    kind === "ok"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
      : kind === "error"
        ? "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
        : "border-stone-300 bg-stone-50 text-stone-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${c}`}>{children}</div>;
}
