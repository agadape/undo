// Public configuration (testnet). Safe for the browser.
export const RPC = "https://rpc.testnet.fastnear.com";
/** Failover order; the free fastnear tier rate-limits bursts (HTTP 429). */
export const RPCS = [RPC, "https://test.rpc.fastnear.com", "https://rpc.testnet.near.org"];
/** Public demo contract: locked (0 keys), 5-minute window, court pinned to the attested NEAR AI key.
 * The earlier dev contract with 90 s windows is nh-v1undo-mvz2j3bw.testnet. */
export const UNDO = process.env.NEXT_PUBLIC_UNDO_CONTRACT ?? "demo.nh-s26r-mvz1zxfx.testnet";
export const USDC = "usdc.fakes.testnet";
export const DAO = "nhspike-mvp6a0dx.sputnikv2.testnet";
/** A copy of the same v1 wasm deployed and locked (no keys) in S25. */
export const LOCKED_EXAMPLE = "lockedmvz3cg5t.nh-v1undo-mvz2j3bw.testnet";
/** base58(sha256(undo_token.wasm)) of the published v1 build. */
export const PUBLISHED_CODE_HASH = "5q9rRircqxg9Bko6gHa4k1ejQzvrb9zgQkkXaZSPsrGz";
/** The Coba Curi guard runs as this GitHub Actions workflow. */
export const GUARD_REPO = "agadape/undo";
export const GUARD_RUNS_API = `https://api.github.com/repos/${GUARD_REPO}/actions/workflows/cobacuri-guard.yml/runs?per_page=1&status=completed`;
export const TX = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`;
export const ADDR = (id: string) => `https://testnet.nearblocks.io/address/${id}`;
export const USDC_DECIMALS = 6;
