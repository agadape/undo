import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { AccountsProvider, AccountSwitcher } from "@/components/accounts";
import { OutgoingAlerts } from "@/components/alerts";
import { Footer, Nav } from "@/components/site-chrome";
import { LangProvider, LangToggle } from "@/lib/i18n";
import { LANG_COOKIE, pickLang, type Lang } from "@/lib/lang";

async function serverLang(): Promise<Lang> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return pickLang(c.get(LANG_COOKIE)?.value, h.get("accept-language"));
}

export async function generateMetadata(): Promise<Metadata> {
  return (await serverLang()) === "en"
    ? {
        title: "Undo — Ctrl+Z for USDC",
        description: "Wrapped USDC you can undo during a window: a panic button and a private court in a TEE. NEAR testnet.",
      }
    : {
        title: "Undo — Ctrl+Z untuk USDC",
        description: "Wrapped USDC yang bisa dibatalkan selama jendela undo: Tombol Panik dan sidang privat di TEE. NEAR testnet.",
      };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await serverLang();
  return (
    <html lang={lang}>
      <body>
        <LangProvider initial={lang}>
          <AccountsProvider>
            <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/90 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
              <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
                <Link href="/" className="flex items-center gap-2 font-semibold">
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-emerald-700 text-sm text-white">⌘Z</span>
                  Undo
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-900 dark:bg-amber-950 dark:text-amber-200">testnet</span>
                </Link>
                <Nav />
                <div className="flex items-center gap-2">
                  <AccountSwitcher />
                  <LangToggle />
                </div>
              </div>
            </header>
            <main className="mx-auto max-w-5xl px-4 py-6">
              <OutgoingAlerts />
              {children}
            </main>
            <Footer />
          </AccountsProvider>
        </LangProvider>
      </body>
    </html>
  );
}
