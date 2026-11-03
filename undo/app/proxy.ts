// ?lang=en|id in a link (e.g. from the README) is applied before the page renders on the server,
// and remembered in the language cookie.
import { NextResponse, type NextRequest } from "next/server";
import { LANG_COOKIE } from "@/lib/lang";

export function proxy(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("lang");
  if (q !== "en" && q !== "id") return NextResponse.next();
  const others = (req.headers.get("cookie") ?? "").split(/;\s*/).filter((c) => c && !c.startsWith(`${LANG_COOKIE}=`));
  const headers = new Headers(req.headers);
  headers.set("cookie", [...others, `${LANG_COOKIE}=${q}`].join("; "));
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set(LANG_COOKIE, q, { path: "/", maxAge: 31_536_000, sameSite: "lax" });
  return res;
}

export const config = { matcher: ["/((?!_next/|api/|favicon).*)"] };
