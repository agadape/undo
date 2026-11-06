import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans, VT323 } from "next/font/google";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { AccountsProvider, AccountSwitcher } from "@/components/accounts";
import { OutgoingAlerts } from "@/components/alerts";
import { Footer, Nav, OsdBar } from "@/components/site-chrome";
import { TimeFx } from "@/components/time-fx";
import { LangProvider, LangToggle } from "@/lib/i18n";
import { LANG_COOKIE, pickLang, type Lang } from "@/lib/lang";

const vt323 = VT323({ weight: "400", subsets: ["latin"], variable: "--font-vt323", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

async function serverLang(): Promise<Lang> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return pickLang(c.get(LANG_COOKIE)?.value, h.get("accept-language"));
}

export const viewport: Viewport = { themeColor: "#07070c" };

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
    <html lang={lang} className={`${vt323.variable} ${jakarta.variable} ${jetbrains.variable}`}>
      <body>
        <LangProvider initial={lang}>
          <AccountsProvider>
            {/* #tape is what the time effects freeze and rewind (see globals.css). */}
            <div id="tape">
              <header className="sticky top-0 z-20 border-b border-line bg-tape/90 backdrop-blur">
                <OsdBar />
                <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pb-3 pt-1.5">
                  <Link href="/" className="flex items-center gap-2">
                    <span className="osd grid h-8 w-8 place-items-center rounded-[2px] border-2 border-phosphor text-lg leading-none text-phosphor">⌘Z</span>
                    <span className="osd rgb text-3xl leading-none">Undo</span>
                    <span className="osd border border-signal px-1 text-sm leading-5 text-signal">testnet</span>
                  </Link>
                  <Nav />
                  <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
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
            </div>
            <TimeFx />
          </AccountsProvider>
        </LangProvider>
      </body>
    </html>
  );
}
