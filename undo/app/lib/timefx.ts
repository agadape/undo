// Screen effects for the tape-deck theme. Call these only after the chain confirmed the action:
//   stop   = panic froze the money (❚❚ PAUSE)
//   rewind = the money went back (◀◀ REW: finalize, a "return" decision)
//   play   = the account runs again (▶ PLAY: unlock)
export type TimeFx = "stop" | "rewind" | "play";
export const TIME_FX_EVENT = "undo:timefx";

export function playTimeFx(kind: TimeFx) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<TimeFx>(TIME_FX_EVENT, { detail: kind }));
}
