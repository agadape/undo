import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { AccountsProvider } from "@/components/accounts";
import { OutgoingAlerts } from "@/components/alerts";
import { Footer, SiteHeader } from "@/components/site-chrome";
import { TimeFx } from "@/components/time-fx";
import { LangProvider } from "@/lib/i18n";
import { LANG_COOKIE, pickLang, type Lang } from "@/lib/lang";

// One family for everything: Archivo (width axis 62–125%). Expanded Black for headlines, normal for text, tabular for timers.
// JetBrains Mono only for ids and hashes.
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap", axes: ["wdth"] });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

async function serverLang(): Promise<Lang> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return pickLang(c.get(LANG_COOKIE)?.value, h.get("accept-language"));
}

export const viewport: Viewport = { themeColor: "#07080b" };

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
    <html lang={lang} className={`${archivo.variable} ${jetbrains.variable}`}>
      <body>
        <LangProvider initial={lang}>
          <AccountsProvider>
            {/* #tape is what the time effects cool down and rewind (see globals.css). */}
            <div id="tape" className="overflow-x-clip">
              <SiteHeader />
              <main className="mx-auto max-w-[1180px] px-4 pb-6 pt-4 sm:px-6">
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
