// POST a NEAR JSON-RPC request -> the same request answered by a public testnet RPC, tried from our server.
// The browser uses this only after all three public RPCs failed at the network level (CORS, HTTP 429, timeout):
// a rate limit on the visitor's own IP does not apply to the server's. See withServerFallback in lib/near-client.ts.
// Read methods plus transaction broadcast (already signed, so nothing secret passes through here). Identical
// reads are answered from a 2 s cache, and each IP has a per-minute limit so this cannot become an open relay.
import { NextResponse } from "next/server";
import { RPCS } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 60;

const UPSTREAMS = [RPCS[1], RPCS[0], RPCS[2], "https://archival-rpc.testnet.fastnear.com"];
const READ = new Set(["query", "block", "status", "gas_price", "chunk", "tx", "EXPERIMENTAL_tx_status", "EXPERIMENTAL_receipt"]);
const SEND = new Set(["send_tx", "broadcast_tx_commit", "broadcast_tx_async"]);
const CACHEABLE = new Set(["query", "block", "gas_price"]);
const CACHE_MS = 2000;
const MAX_BODY = 64 * 1024;
const PER_IP_PER_MIN = 240;

type RpcRequest = { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };
const cache = new Map<string, { at: number; body: string }>();
const hits = new Map<string, { start: number; n: number }>();

function allow(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.start > 60_000) {
    hits.set(ip, { start: now, n: 1 });
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > 60_000) hits.delete(k);
    return true;
  }
  h.n += 1;
  return h.n <= PER_IP_PER_MIN;
}

/** A rate limit or an overloaded node: worth trying the next upstream. A contract error is a real answer. */
function overloaded(status: number, text: string) {
  if (status !== 200) return true;
  return /too many requests|rate limit|limit exceeded|over capacity|timeout/i.test(text.slice(0, 600)) && !/"result"/.test(text.slice(0, 200));
}

function rpcError(id: unknown, message: string, status: number) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code: -32000, message, data: message, name: "HANDLER_ERROR", cause: { name: "UPSTREAM" } } }, { status });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return rpcError(null, "request too large", 413);
  let rpc: RpcRequest;
  try {
    rpc = JSON.parse(raw);
  } catch {
    return rpcError(null, "body must be one JSON-RPC request", 400);
  }
  const method = typeof rpc.method === "string" ? rpc.method : "";
  if (!READ.has(method) && !SEND.has(method)) return rpcError(rpc.id, `method not allowed: ${method.slice(0, 40)}`, 400);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  if (!allow(ip)) return rpcError(rpc.id, "rate limit of the Undo RPC fallback", 429);

  const key = CACHEABLE.has(method) ? `${method}|${JSON.stringify(rpc.params)}` : null;
  if (key) {
    const c = cache.get(key);
    if (c && Date.now() - c.at < CACHE_MS) return withId(c.body, rpc.id, "hit");
  }
  const forward = JSON.stringify({ jsonrpc: "2.0", id: "undo", method, params: rpc.params });
  const timeout = SEND.has(method) ? 50_000 : 8_000;
  const tried: string[] = [];
  for (const url of UPSTREAMS) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: forward, signal: AbortSignal.timeout(timeout) });
      const text = await res.text();
      if (overloaded(res.status, text)) {
        tried.push(`${new URL(url).host} ${res.status}`);
        continue;
      }
      if (key) {
        cache.set(key, { at: Date.now(), body: text });
        if (cache.size > 500) for (const [k, v] of cache) if (Date.now() - v.at >= CACHE_MS) cache.delete(k);
      }
      return withId(text, rpc.id, "miss");
    } catch (e) {
      tried.push(`${new URL(url).host} ${(e as Error).name === "TimeoutError" ? "timeout" : "error"}`);
      // A broadcast that timed out may still land: do not send the same signed transaction to another node.
      if (SEND.has(method) && (e as Error).name === "TimeoutError") break;
    }
  }
  return rpcError(rpc.id, `all upstream RPCs failed (${tried.join(", ")})`, 502);
}

/** Answer with the caller's own JSON-RPC id; X-Undo-Cache says whether the 2 s cache answered. */
function withId(text: string, id: unknown, cacheState: "hit" | "miss") {
  let body: string;
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    j.id = id ?? null;
    body = JSON.stringify(j);
  } catch {
    return rpcError(id, "upstream answered with invalid JSON", 502);
  }
  return new NextResponse(body, { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Undo-Cache": cacheState } });
}
