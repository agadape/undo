"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { TX } from "@/lib/config";
import { useT } from "@/lib/i18n";

/** `tone`: danger (red frame), accent (green frame), frozen (ice-blue frame: the money in it is paused). */
export function Card({ title, children, right, tone }: { title?: ReactNode; children: ReactNode; right?: ReactNode; tone?: "danger" | "accent" | "frozen" }) {
  const ring =
    tone === "danger"
      ? "border-rec/70 bg-panel"
      : tone === "accent"
        ? "border-phosphor/60 bg-panel"
        : tone === "frozen"
          ? "border-ice/70 bg-[#0c1a33] bg-[repeating-linear-gradient(115deg,transparent_0_22px,#2ec8ff0d_22px_24px)]"
          : "border-line bg-panel";
  return (
    // overflow-wrap:anywhere so long account ids, hashes and test names wrap on a phone instead of widening the page.
    <section className={`relative rounded-[3px] border ${ring} p-4 transition-colors [overflow-wrap:anywhere] sm:p-5`}>
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 className="osd rgb flex min-w-0 items-center gap-1.5 text-2xl leading-none text-ink">
            <span aria-hidden className={tone === "danger" ? "text-rec" : tone === "frozen" ? "text-ice" : "text-phosphor"}>
              ▌
            </span>
            {title}
          </h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

type Variant = "primary" | "danger" | "ghost";
const BTN: Record<Variant, string> = {
  primary: "border-phosphor text-phosphor hover:bg-phosphor hover:text-tape disabled:hover:bg-transparent disabled:hover:text-phosphor",
  danger: "border-rec bg-rec text-tape hover:bg-transparent hover:text-rec disabled:hover:bg-rec disabled:hover:text-tape",
  ghost: "border-line-2 text-ink hover:border-ink hover:bg-ink hover:text-tape disabled:hover:border-line-2 disabled:hover:bg-transparent disabled:hover:text-ink",
};

/** Classes for a button-looking link (Link / a) so it matches <Button>. */
export const btnClass = (variant: Variant = "primary", small = false) =>
  `osd inline-flex items-center justify-center gap-1.5 rounded-[2px] border-2 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
    small ? "px-2.5 py-0.5 text-lg leading-6" : "px-4 py-1 text-xl leading-7"
  } ${BTN[variant]}`;

/** Classes for text inputs, selects and text areas. */
export const inputClass = "rounded-[2px] border border-line-2 bg-well px-2 py-1.5 text-ink placeholder:text-muted/70 focus:border-phosphor focus:outline-none";

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
      {busy ? <span className="blink">■ ■ ■</span> : children}
    </button>
  );
}

// Each status is a tape-deck state: ▶ running in its window, ❚❚ paused (frozen or waiting for the council),
// ■ stopped (final), ◀◀ rewound (sent back).
const STATUS: Record<string, [string, string]> = {
  Pending: ["▶", "bg-signal/15 text-signal"],
  Frozen: ["❚❚", "bg-ice/15 text-ice"],
  Disputed: ["❚❚", "bg-plum/15 text-plum"],
  Settled: ["■", "bg-phosphor/15 text-phosphor"],
  Reversed: ["◀◀", "bg-ink/10 text-dim"],
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
    <span className={`osd inline-flex items-center gap-1 whitespace-nowrap rounded-[2px] px-1.5 text-base leading-6 ${cls}`}>
      {icon && <span aria-hidden>{icon}</span>}
      {l ? t(l[0], l[1]) : status}
    </span>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "danger" | "ok" }) {
  const c = tone === "danger" ? "bg-rec text-tape" : tone === "ok" ? "bg-phosphor/15 text-phosphor" : "bg-ink/10 text-dim";
  return <span className={`osd inline-block rounded-[2px] px-1.5 text-base leading-6 ${c}`}>{children}</span>;
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
      <span className="font-display text-[1.2em] leading-none tabular-nums">{m > 0 ? `${m}m ${s}s` : `${s}s`}</span>
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
  const c = kind === "ok" ? "border-phosphor bg-phosphor/5" : kind === "error" ? "border-rec bg-rec/10" : "border-line-2 bg-well text-dim";
  const tag = kind === "ok" ? <span className="text-phosphor">■ OK</span> : kind === "error" ? <span className="text-rec">● ERR</span> : null;
  return (
    <div className={`flex gap-2.5 rounded-[2px] border-l-4 px-3 py-2 text-sm ${c}`}>
      {tag && (
        <span aria-hidden className="osd shrink-0 text-base leading-5">
          {tag}
        </span>
      )}
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}
