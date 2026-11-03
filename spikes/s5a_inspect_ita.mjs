// S5a — inspect the public Intel Trust Authority attestation tokens (no API key needed).
// Fetch first:  GET https://cloud-api.near.ai/v1/attestation/ita-token?model=...&nonce=...&signing_algo=ecdsa
import fs from "node:fs";

const file = process.argv[2] ?? "out/s5a_ita_token.json";
const j = JSON.parse(fs.readFileSync(file, "utf8"));
const decode = (t) => JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());
const header = (t) => JSON.parse(Buffer.from(t.split(".")[0], "base64url").toString());
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o?.[k] !== undefined).map((k) => [k, typeof o[k] === "string" ? o[k].slice(0, 100) : o[k]]));

console.log("nonce echoed:", j.nonce, "| jwks_url:", j.jwks_url, "| policy_must_match:", j.policy_must_match);

function show(label, token) {
  const c = decode(token);
  console.log(`\n== ${label}: alg=${header(token).alg} kid=${header(token).kid?.slice(0, 16)} iss=${c.iss}`);
  console.log("   issued:", new Date(c.iat * 1000).toISOString(), "expires:", new Date(c.exp * 1000).toISOString());
  const tdx = c.tdx ?? {};
  console.log("   tdx:", JSON.stringify(pick(tdx, ["attester_type", "attester_tcb_status", "attester_tcb_date", "tdx_is_debuggable", "tdx_mrtd", "tdx_report_data", "attester_runtime_data"]), null, 1).slice(0, 900));
  if (c.nvgpu || c.nvidia) console.log("   gpu claims present:", Object.keys(c.nvgpu ?? c.nvidia).slice(0, 10));
  const s = JSON.stringify(c);
  console.log("   nonce bound in claims:", s.includes(j.nonce) ? "yes (exact hex found)" : "not found as plain hex");
  console.log("   claim keys:", Object.keys(c).join(","));
}

if (j.gateway?.token) show("gateway", j.gateway.token);
for (const [i, m] of (j.models ?? []).entries()) {
  console.log(`\n-- model[${i}] keys:`, Object.keys(m).join(","), "| model:", m.model ?? m.model_id, "| signing_address:", m.signing_address, "| signing_algo:", m.signing_algo);
  if (m.token) show(`model[${i}] ${m.model ?? ""}`, m.token);
}
