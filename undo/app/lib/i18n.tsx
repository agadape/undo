"use client";
// Two-language UI (Indonesian / English). Strings live next to each other in the components:
//   const t = useT();  t("Kirim", "Send")
// The server picks the first language (cookie, else the browser's language), so there is no flash.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { LANG_COOKIE, splitReason, type Lang } from "./lang";
import { formatAmount } from "./near-client";

type Ctx = { lang: Lang; setLang: (l: Lang) => void };
const LangContext = createContext<Ctx>({ lang: "en", setLang: () => {} });

export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setState] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => {
    setState(l);
    try {
      document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = l;
      document.title = l === "en" ? "Undo — Ctrl+Z for USDC" : "Undo — Ctrl+Z untuk USDC";
    } catch {
      /* ignore */
    }
  }, []);
  // A link such as /dompet?lang=en (used in the README) switches and remembers the language.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q === "en" || q === "id") setLang(q);
  }, [setLang]);
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext).lang;

/** Returns t(indonesian, english). */
export function useT() {
  const lang = useLang();
  return useCallback((id: string, en: string) => (lang === "en" ? en : id), [lang]);
}

/** Returns fmt(raw) for 6-decimal amounts in the chosen language's number format. */
export function useFmt() {
  const lang = useLang();
  return useCallback((raw: string | bigint | null | undefined) => formatAmount(raw, lang), [lang]);
}

/** Returns reason => the part of a bilingual court reason ("ID: … EN: …") in the chosen language. */
export function useReason() {
  const lang = useLang();
  return useCallback(
    (reason: string) => {
      const r = splitReason(reason);
      return r ? r[lang] : reason;
    },
    [lang],
  );
}

// Demo account labels are stored in localStorage in Indonesian and also used as lookup keys
// (e.g. a.label === "Pencuri"), so they are translated only when shown.
const ACCOUNT_LABELS: Record<string, string> = {
  "Dompet utama": "Main wallet",
  "Akun pemulihan (HP)": "Recovery account (phone)",
  "Pemulihan untuk wallet": "Recovery for wallet",
  "Penjual / toko": "Seller / shop",
  Pencuri: "Thief",
  Wallet: "Wallet",
};

/** Returns label => label in the chosen language (unknown labels are shown as stored). */
export function useAccountLabel() {
  const lang = useLang();
  return useCallback((label: string) => (lang === "en" ? (ACCOUNT_LABELS[label] ?? label) : label), [lang]);
}

export function LangToggle() {
  const { lang, setLang } = useContext(LangContext);
  return (
    <div role="group" aria-label="Language / Bahasa" className="flex shrink-0 overflow-hidden rounded-md border border-stone-300 text-xs dark:border-stone-700">
      {(["id", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`px-2 py-1 font-medium ${lang === l ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900" : "hover:bg-stone-200 dark:hover:bg-stone-800"}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
