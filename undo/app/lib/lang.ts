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

/** Language of an API request: the cookie the browser sends, else Accept-Language. */
export const requestLang = (req: Request): Lang => pickLang(langFromCookieHeader(req.headers.get("cookie")), req.headers.get("accept-language"));
