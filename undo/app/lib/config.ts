// Public configuration (testnet). Safe for the browser.
export const RPC = "https://rpc.testnet.fastnear.com";
/** Failover order; the free fastnear tier rate-limits bursts (HTTP 429). */
export const RPCS = [RPC, "https://test.rpc.fastnear.com", "https://near-testnet.drpc.org"];
/** Public demo contract v2 (trusted contacts): locked (0 keys), reproducible build, 5-minute window, court pinned
 * to the attested NEAR AI key. The v1 public demo (still live, locked) is UNDO_V1; the earlier dev contract with
 * 90 s windows is nh-v1undo-mvz2j3bw.testnet. */
export const UNDO = process.env.NEXT_PUBLIC_UNDO_CONTRACT ?? "undo-demo-v2.testnet";
export const UNDO_V1 = "demo.nh-s26r-mvz1zxfx.testnet";
export const USDC = "usdc.fakes.testnet";
/** Safety actions the Undo relayer sends gasless (NEP-366). None takes a deposit, so the locked demo contract
 * accepts them as meta-transactions and still sees the signer (e.g. the recovery account) as the caller. */
export const GASLESS_METHODS = ["panic", "unlock", "release", "cancel_recovery_change", "cancel_contact", "finalize", "release_expired"];
export const DAO = "nhspike-mvp6a0dx.sputnikv2.testnet";
/** A copy of the same v1 wasm deployed and locked (no keys) in S25. */
export const LOCKED_EXAMPLE = "lockedmvz3cg5t.nh-v1undo-mvz2j3bw.testnet";
/** base58(sha256(undo_token.wasm)) of the published v1 build (git tag contract-v1). */
export const V1_CODE_HASH = "5q9rRircqxg9Bko6gHa4k1ejQzvrb9zgQkkXaZSPsrGz";
/** v2: `cargo near build reproducible-wasm` in undo/contracts/undo-token at commit 65c1c0e (sourcescan/cargo-near 0.21.1). */
export const V2_CODE_HASH = "AzDhXsj2JzWQAEjScj5SrubF4Q96VCLPHTRawcpHnZkJ";
/** The Coba Curi guard runs as this GitHub Actions workflow. */
export const GUARD_REPO = "agadape/undo";
/** The Cloudflare Worker guard (cron every minute) publishes its last heartbeat here (CORS open). */
export const GUARD_HEARTBEAT_URL = "https://undo-cobacuri-guard.agadape.workers.dev/";
export const GUARD_RUNS_API = `https://api.github.com/repos/${GUARD_REPO}/actions/workflows/cobacuri-guard.yml/runs?per_page=1&status=completed`;
export const TX = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`;
export const ADDR = (id: string) => `https://testnet.nearblocks.io/address/${id}`;
export const USDC_DECIMALS = 6;
