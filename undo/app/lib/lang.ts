// Language choice shared by the server (first render, API messages) and the browser.
export type Lang = "id" | "en";
export const LANG_COOKIE = "undo.lang";

/** A saved choice wins; otherwise Indonesian only when the browser's first language is Indonesian. */
export function pickLang(cookie?: string | null, acceptLanguage?: string | null): Lang {
  if (cookie === "id" || cookie === "en") return cookie;
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("id") ? "id" : "en";
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
