"use client";
// Header navigation, the camcorder OSD bar and the footer, in the chosen language.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { TIME_FX_EVENT, type TimeFx } from "@/lib/timefx";

export function Nav() {
  const t = useT();
  const path = usePathname() ?? "/";
  const items = [
    { href: "/", label: t("Beranda", "Home") },
    { href: "/dompet", label: t("Dompet", "Wallet") },
    { href: "/coba-curi", label: t("Coba Curi", "Try to steal") },
    { href: "/dewan", label: t("Dewan", "Council") },
    { href: "/janji", label: t("Janji", "Promises") },
  ];
  // A court case belongs to the council's pages.
  const on = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/dewan" && path.startsWith("/sidang")));
  return (
    <nav className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={on(n.href) ? "page" : undefined}
          className={`osd whitespace-nowrap rounded-[2px] px-2.5 py-0.5 text-xl leading-7 ${on(n.href) ? "bg-vhs text-white" : "text-dim hover:bg-ink/10 hover:text-ink"}`}
        >
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

/** Camcorder on-screen display: the tape state (follows the time effects) and a REC clock. Decorative. */
export function OsdBar() {
  const [clock, setClock] = useState<string>();
  const [state, setState] = useState<TimeFx | null>(null);
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-GB", { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      setState((e as CustomEvent<TimeFx>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setState(null), 4000);
    };
    window.addEventListener(TIME_FX_EVENT, on);
    return () => {
      window.removeEventListener(TIME_FX_EVENT, on);
      clearTimeout(timer);
    };
  }, []);
  const label = state === "stop" ? "❚❚ PAUSE" : state === "rewind" ? "◀◀ REW" : "▶ PLAY";
  return (
    <div aria-hidden className="osd rgb mx-auto flex max-w-5xl items-center justify-between px-4 pt-2 text-xl leading-none">
      <span className={state === "stop" ? "text-ice" : state === "rewind" ? "text-phosphor" : ""}>{label}</span>
      <span>
        <span className="blink text-rec">●</span> REC <span className="tabular-nums">{clock ?? "--:--:--"}</span> SP
      </span>
    </div>
  );
}

export function Footer() {
  const t = useT();
  return (
    <footer className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 border-t border-line px-4 pb-10 pt-4 text-xs text-muted">
      <span>{t("Undo · NEAR testnet · semua akun dan uang di sini adalah uang uji coba.", "Undo · NEAR testnet · every account and every coin here is test money.")}</span>
      <span aria-hidden className="osd text-base">
        ■ STOP · ◀◀ CTRL+Z
      </span>
    </footer>
  );
}
