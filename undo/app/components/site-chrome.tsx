"use client";
// Header, navigation and footer, in the chosen language.
// Two headers on purpose: Home is the story (no account picker), every other page is the app.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountSwitcher } from "@/components/accounts";
import { btnClass } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { TIME_FX_EVENT, type TimeFx } from "@/lib/timefx";

function Wordmark() {
  return (
    <Link href="/" className="flex shrink-0 items-baseline gap-2" aria-label="Undo">
      <span className="serif text-[1.65rem] leading-none tracking-tight">Undo</span>
      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-signal">testnet</span>
    </Link>
  );
}

export function Nav({ home = false }: { home?: boolean }) {
  const t = useT();
  const path = usePathname() ?? "/";
  const items = [
    ...(home ? [] : [{ href: "/", label: t("Beranda", "Home") }]),
    { href: "/dompet", label: t("Dompet", "Wallet") },
    { href: "/coba-curi", label: t("Coba Curi", "Try to steal") },
    { href: "/dewan", label: t("Dewan", "Council") },
    { href: "/janji", label: t("Janji", "Promises") },
  ];
  // A court case belongs to the council's pages.
  const on = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/dewan" && path.startsWith("/sidang")));
  return (
    <nav className="-mx-1 flex max-w-full items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={on(n.href) ? "page" : undefined}
          className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${on(n.href) ? "bg-raise text-ink" : "text-dim hover:text-ink"}`}
        >
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

/** Tape state while a time effect runs (pause / rewind / play). Lives in the app header, small. Decorative. */
function TapeState() {
  const [state, setState] = useState<TimeFx | null>(null);
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
  if (!state) return null;
  const label = state === "stop" ? "❚❚ PAUSE" : state === "rewind" ? "◀◀ REW" : "▶ PLAY";
  return (
    <span aria-hidden className={`timer text-lg leading-none ${state === "stop" ? "text-ice" : "text-sky"}`}>
      {label}
    </span>
  );
}

export function SiteHeader() {
  const t = useT();
  const path = usePathname() ?? "/";
  const home = path === "/";
  // Home floats a transparent header over the 3D intro: only small glass pills, no bar, no blur over the moving canvas.
  return (
    // No backdrop blur on the sticky header: it would be recomputed on every scroll frame. A solid header looks the same.
    <header className={home ? "home-hdr fixed inset-x-0 top-0 z-30" : "sticky top-0 z-20 bg-tape"}>
      {home ? (
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Wordmark />
          <div className="hidden rounded-full p-1 glass-btn md:block">
            <Nav home />
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dompet" className={btnClass("ghost", true)}>
              {t("Buka dompet", "Open wallet")}
            </Link>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <Wordmark />
            <TapeState />
          </div>
          <div className="order-3 w-full md:order-none md:w-auto">
            <Nav />
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <AccountSwitcher />
          </div>
        </div>
      )}
    </header>
  );
}

export function Footer() {
  const t = useT();
  return (
    <footer className="mx-auto mt-28 max-w-[1180px] overflow-hidden px-4 pb-10 sm:px-6">
      <div
        aria-hidden
        className="serif select-none bg-[url(/undo/frost.webp),linear-gradient(180deg,#eaf6ff4d,#eaf6ff05_85%)] bg-[length:110%_auto,100%_100%] bg-[position:50%_30%,0_0] bg-blend-screen bg-clip-text text-center text-[26vw] font-black leading-[0.8] text-transparent [mask-image:linear-gradient(180deg,#000_25%,transparent_95%)] sm:text-[19rem]"
      >
        Undo
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{t("Undo · NEAR testnet · semua akun dan uang di sini adalah uang uji coba.", "Undo · NEAR testnet · every account and every coin here is test money.")}</span>
        <span aria-hidden className="timer text-base">
          ■ STOP · ◀◀ CTRL+Z
        </span>
      </div>
    </footer>
  );
}
