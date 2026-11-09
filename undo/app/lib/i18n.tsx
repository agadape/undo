"use client";
// The UI is shown in English only (lib/lang.ts pickLang). Strings still live in pairs in the components:
//   const t = useT();  t("Kirim", "Send")
// so an Indonesian version could be switched back on later.
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
  // English only: an old "id" cookie or ?lang=id from a saved link is replaced with "en".
  useEffect(() => {
    if (initial !== "en" || document.cookie.includes(`${LANG_COOKIE}=id`)) setLang("en");
  }, [initial, setLang]);
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext).lang;

/** Returns t(indonesian, english). */
export function useT() {
  const lang = useLang();
  return useCallback((id: string, en: string) => (lang === "en" ? en : id), [lang]);
}

/** Returns r => " · gasless: paid by the Undo relayer" when a call went through the relayer, else "". */
export function useGasNote() {
  const t = useT();
  return useCallback((r: { gasless?: boolean }) => (r.gasless ? t(" · tanpa gas: dibayar relayer Undo", " · gasless: paid by the Undo relayer") : ""), [t]);
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

