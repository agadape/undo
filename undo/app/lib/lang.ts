// Language choice shared by the server (first render, API messages) and the browser.
export type Lang = "id" | "en";
export const LANG_COOKIE = "undo.lang";

/** A saved choice (the ID / EN switch, or ?lang=) wins; otherwise English, whatever the browser's language. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function pickLang(cookie?: string | null, _acceptLanguage?: string | null): Lang {
  return cookie === "id" ? "id" : "en";
}

export function langFromCookieHeader(cookieHeader?: string | null): string | undefined {
  return cookieHeader?.match(/(?:^|;\s*)undo\.lang=(id|en)/)?.[1];
}

/** Splits a court public reason "ID: … EN: …" (prompt v2) into its two languages; null for a one-language reason. */
export function splitReason(reason: string): { id: string; en: string } | null {
  const m = reason.match(/^\s*ID:\s*([\s\S]*?)\s*[|/]?\s*EN:\s*([\s\S]*?)\s*$/);
  return m && m[1] && m[2] ? { id: m[1], en: m[2] } : null;
}

/** Language of an API request: the cookie the browser sends, else Accept-Language. */
export const requestLang = (req: Request): Lang => pickLang(langFromCookieHeader(req.headers.get("cookie")), req.headers.get("accept-language"));
