"use client";
// The one object of the "Pita Beku" theme: a smoked-glass cassette.
// - The label strip holds real text (the Home headline, or the Wallet balance), so text and object are one piece.
// - The window holds the tape: two reels, the playhead and one glass disc per transfer.
// - Frost (public/undo/frost.webp) is screen-blended over the glass while the account is frozen.
// Positions of the label and the window are measured from public/undo/cassette.webp (see GEOM).
import type { CSSProperties, ReactNode } from "react";

export type TapeState = "play" | "pause" | "rew" | "stop";
/** One transfer on the tape. `at` 0..1 = how far it travelled through its window (0 = just sent, 1 = final). */
export type Disc = { id: string; at: number; tone?: "pending" | "frozen" | "back" | "danger" };

// Label and window boxes in % of the image (left, top, width, height). Measured from the asset.
const GEOM = {
  label: { l: 9.8, t: 15.3, w: 80.8, h: 12.7 },
  window: { l: 10, t: 30.6, w: 80.2, h: 36.8 },
};

const DISC: Record<NonNullable<Disc["tone"]>, string> = {
  pending: "var(--color-signal)",
  frozen: "var(--color-ice)",
  back: "var(--color-sky)",
  danger: "var(--color-rec)",
};

const box = (g: { l: number; t: number; w: number; h: number }): CSSProperties => ({ left: `${g.l}%`, top: `${g.t}%`, width: `${g.w}%`, height: `${g.h}%` });

export function Cassette({
  label,
  state = "stop",
  discs = [],
  timer,
  playhead,
  className = "",
  decorative = false,
}: {
  label?: ReactNode;
  state?: TapeState;
  discs?: Disc[];
  timer?: ReactNode;
  /** 0..1 position of the blue playhead along the tape; omitted = hidden. */
  playhead?: number;
  className?: string;
  decorative?: boolean;
}) {
  // Discs travel between the two reels: 31% .. 69% of the window width.
  const x = (at: number) => `${31 + Math.max(0, Math.min(1, at)) * 38}%`;
  return (
    <div className={`cas ${className}`} data-state={state} aria-hidden={decorative || undefined}>
      <div className="cas-glow" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cas-shell" src="/undo/cassette.webp" alt="" width={1536} height={1024} draggable={false} fetchPriority="high" />
      <div className="cas-window" style={box(GEOM.window)}>
        <span className="cas-tape" />
        <span className="cas-reel" style={{ left: "19%" }} />
        <span className="cas-reel" style={{ left: "81%" }} />
        {playhead !== undefined && <span className="cas-playhead" style={{ left: x(playhead) }} />}
        {discs.slice(0, 6).map((d) => (
          <span key={d.id} className="cas-disc" style={{ left: x(d.at), "--disc": DISC[d.tone ?? "pending"] } as CSSProperties} />
        ))}
        {timer !== undefined && <span className="cas-timer">{timer}</span>}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cas-frost" src="/undo/frost.webp" alt="" width={1536} height={1024} loading="lazy" draggable={false} />
      {label !== undefined && (
        <div className="cas-label" style={box(GEOM.label)}>
          {label}
        </div>
      )}
    </div>
  );
}
