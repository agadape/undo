import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { AccountsProvider, AccountSwitcher } from "@/components/accounts";

export const metadata: Metadata = {
  title: "Undo — Ctrl+Z untuk USDC",
  description: "Wrapped USDC yang bisa dibatalkan selama jendela undo: Tombol Panik dan sidang privat di TEE. NEAR testnet.",
};

const NAV = [
  { href: "/", label: "Beranda" },
  { href: "/dompet", label: "Dompet" },
  { href: "/coba-curi", label: "Coba Curi" },
  { href: "/dewan", label: "Dewan" },
  { href: "/janji", label: "Janji" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <AccountsProvider>
          <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/90 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
              <Link href="/" className="flex items-center gap-2 font-semibold">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-emerald-700 text-sm text-white">⌘Z</span>
                Undo
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-900 dark:bg-amber-950 dark:text-amber-200">testnet</span>
              </Link>
              <nav className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href} className="rounded-md px-2.5 py-1.5 hover:bg-stone-200 dark:hover:bg-stone-800">
                    {n.label}
                  </Link>
                ))}
              </nav>
              <AccountSwitcher />
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
          <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-stone-500">
            Undo · NEAR testnet · semua akun dan uang di sini adalah uang uji coba.
          </footer>
        </AccountsProvider>
      </body>
    </html>
  );
}
