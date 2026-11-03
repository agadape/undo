"use client";
// Header navigation and footer, in the chosen language.
import Link from "next/link";
import { useT } from "@/lib/i18n";

export function Nav() {
  const t = useT();
  const items = [
    { href: "/", label: t("Beranda", "Home") },
    { href: "/dompet", label: t("Dompet", "Wallet") },
    { href: "/coba-curi", label: t("Coba Curi", "Try to steal") },
    { href: "/dewan", label: t("Dewan", "Council") },
    { href: "/janji", label: t("Janji", "Promises") },
  ];
  return (
    <nav className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((n) => (
        <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-2.5 py-1.5 hover:bg-stone-200 dark:hover:bg-stone-800">
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

export function Footer() {
  const t = useT();
  return (
    <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-stone-500">
      {t("Undo · NEAR testnet · semua akun dan uang di sini adalah uang uji coba.", "Undo · NEAR testnet · every account and every coin here is test money.")}
    </footer>
  );
}
