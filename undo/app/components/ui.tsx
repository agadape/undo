"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { TX } from "@/lib/config";
import { useT } from "@/lib/i18n";

/** A smoked-glass surface. No outline: space and a slightly lighter surface separate it from the page.
 *  `tone`: danger (a faint red glow), accent (a faint blue glow), frozen (ice: the money in it is paused). */
export function Card({ title, children, right, tone }: { title?: ReactNode; children: ReactNode; right?: ReactNode; tone?: "danger" | "accent" | "frozen" }) {
  const surface =
    tone === "danger"
      ? "bg-panel bg-[radial-gradient(120%_80%_at_0%_0%,#ff3b5f14,transparent_60%)]"
      : tone === "accent"
        ? "bg-panel bg-[radial-gradient(120%_80%_at_0%_0%,#8fdcff14,transparent_60%)]"
        : tone === "frozen"
          ? "bg-panel bg-[radial-gradient(120%_90%_at_50%_0%,#9fe8ff1f,transparent_65%)]"
          : "bg-panel";
  return (
    // overflow-wrap:anywhere so long account ids, hashes and test names wrap on a phone instead of widening the page.
    <section className={`relative rounded-[14px] ${surface} p-5 transition-colors [overflow-wrap:anywhere] sm:p-7`}>
      {(title || right) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 className="serif min-w-0 text-[1.4rem] leading-tight text-ink sm:text-[1.6rem]">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

type Variant = "primary" | "danger" | "ghost";
const BTN: Record<Variant, string> = {
  primary: "bg-snow text-tape shadow-[0_10px_30px_-12px_#9fe8ff8c] hover:shadow-[0_0_0_6px_#9fe8ff24,0_18px_40px_-14px_#9fe8ffbf] disabled:hover:shadow-none",
  danger: "bg-rec text-white shadow-[0_12px_34px_-12px_#ff2e4dcc] hover:bg-[#ff4d68] disabled:hover:bg-rec",
  ghost: "glass-btn text-ink hover:bg-[#eaf6ff26] disabled:hover:bg-[#eaf6ff14]",
};

/** Classes for a button-looking link (Link / a) so it matches <Button>.
 *  `btn-glint` = a cold glint that runs across on hover, plus a 2px lift (globals.css). */
export const btnClass = (variant: Variant = "primary", small = false) =>
  `btn-glint inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-center font-btn font-bold disabled:cursor-not-allowed disabled:opacity-40 ${
    small ? "min-h-9 px-4 py-1.5 text-sm" : "min-h-11 px-6 py-2.5 text-[0.95rem]"
  } ${BTN[variant]}`;

/** Classes for text inputs, selects and text areas. */
export const inputClass = "min-h-10 rounded-[10px] border border-line bg-well px-3 py-2 text-ink placeholder:text-muted focus:border-sky focus:outline-none";

type BtnProps = { children: ReactNode; onClick?: () => void | Promise<void>; variant?: Variant; disabled?: boolean; small?: boolean; title?: string };
export function Button({ children, onClick, variant = "primary", disabled, small, title }: BtnProps) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      title={title}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={async () => {
        if (!onClick) return;
        setBusy(true);
        try {
          await onClick();
        } finally {
          setBusy(false);
        }
      }}
      className={btnClass(variant, small)}
    >
      {busy ? <span className="blink">● ● ●</span> : children}
    </button>
  );
}

// Each status is a tape-deck state: ▶ running in its window, ❚❚ paused (frozen or waiting for the council),
// ■ stopped (final), ◀◀ rewound (sent back).
const STATUS: Record<string, [string, string]> = {
  Pending: ["▶", "bg-signal/15 text-signal"],
  Frozen: ["❚❚", "bg-ice/15 text-ice"],
  Disputed: ["❚❚", "bg-plum/15 text-plum"],
  Settled: ["■", "bg-ink/10 text-ink"],
  Reversed: ["◀◀", "bg-sky/15 text-sky"],
};
const LABEL: Record<string, [string, string]> = {
  Pending: ["Pending", "Pending"],
  Frozen: ["Dibekukan", "Frozen"],
  Disputed: ["Sengketa", "Disputed"],
  Settled: ["Final", "Final"],
  Reversed: ["Dibatalkan", "Reversed"],
};

export function StatusBadge({ status }: { status: string }) {
  const t = useT();
  const l = LABEL[status];
  const [icon, cls] = STATUS[status] ?? ["", "bg-ink/10 text-dim"];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold leading-6 ${cls}`}>
      {icon && <span aria-hidden>{icon}</span>}
      {l ? t(l[0], l[1]) : status}
    </span>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "danger" | "ok" }) {
  const c = tone === "danger" ? "bg-rec text-white" : tone === "ok" ? "bg-sky/15 text-sky" : "bg-ink/10 text-dim";
  return <span className={`inline-block rounded-full px-2.5 text-xs font-semibold leading-6 ${c}`}>{children}</span>;
}

export function TxLink({ hash, label }: { hash?: string; label?: string }) {
  if (!hash) return null;
  return (
    <a className="mono text-xs text-phosphor underline decoration-dotted underline-offset-2 hover:text-ink" href={TX(hash)} target="_blank" rel="noreferrer">
      {label ?? `${hash.slice(0, 8)}…`}
    </a>
  );
}

/** Two tape reels. `state`: "play" turns them, "rew" spins them backwards, otherwise they stand still. */
export function Reels({ state, size = "2.5rem" }: { state?: "play" | "rew" | "stop"; size?: string }) {
  return (
    <span aria-hidden className={`inline-flex gap-2 ${state === "play" ? "reels-play" : state === "rew" ? "reels-rew" : ""}`} style={{ "--reel": size } as CSSProperties}>
      <span className="reel" />
      <span className="reel" />
    </span>
  );
}

/** Live countdown to a nanosecond timestamp. */
export function Countdown({ ns, done, prefix }: { ns: string | null | undefined; done?: ReactNode; prefix?: ReactNode }) {
  const t = useT();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!ns) return null;
  const left = Math.floor(Number(BigInt(ns) / 1_000_000n - BigInt(now)) / 1000);
  if (left <= 0) return <span className="text-muted">{done ?? t("lewat", "passed")}</span>;
  const m = Math.floor(left / 60);
  const s = left % 60;
  return (
    <span>
      {prefix}
      <span className="font-semibold tabular-nums">{m > 0 ? `${m}m ${s}s` : `${s}s`}</span>
    </span>
  );
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
    let fails = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async (first: boolean) => {
      // Skip polls while the tab is hidden (saves the free RPC quota).
      if (first || typeof document === "undefined" || !document.hidden) {
        try {
          const v = await loadRef.current();
          if (!alive) return;
          setValue(v);
          setError(undefined);
          fails = 0;
        } catch (e) {
          if (!alive) return;
          setError(String((e as Error)?.message ?? e));
          fails = Math.min(fails + 1, 5);
        }
      }
      // Back off while the RPC refuses (e.g. HTTP 429 on the free tier): 2x, 4x … up to 60 s.
      if (alive) timer = setTimeout(() => run(false), Math.min(60_000, ms * 2 ** fails));
    };
    run(true);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, ms]);
  return [value, () => setTick((x) => x + 1), error];
}

export function Notice({ kind, children }: { kind: "ok" | "error" | "info"; children: ReactNode }) {
  const c = kind === "ok" ? "bg-sky/10" : kind === "error" ? "bg-rec/12" : "bg-well text-dim";
  const dot = kind === "ok" ? "bg-sky" : kind === "error" ? "bg-rec" : null;
  return (
    <div className={`flex items-start gap-2.5 rounded-[10px] px-3.5 py-2.5 text-sm ${c}`}>
      {dot && <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />}
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}
