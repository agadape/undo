//! Spike S26: "court level 2". The contract proves WHAT the TEE model read, not only what it said.
//!
//! The court server is not trusted. To post a recommendation it must hand the contract the pieces of
//! the request; the contract rebuilds the exact request bytes itself and checks them against the
//! request hash inside the TEE signature. So the model provably read:
//! - the registered system prompt (its sha256 is fixed at init),
//! - the case file the contract builds (transfer id, amount, on-chain random case nonce),
//! - every committed evidence envelope, in commit order, and nothing else.
//!
//! Evidence stays encrypted to the model. The system message is opened with a key the contract
//! derives itself (X25519 + HKDF, the same derivation the model does), because XChaCha20-Poly1305 is
//! not key-committing: a supplied key could open a crafted ciphertext to text the model never saw.
//! The verdict field is opened with its per-message key; only `content` is opened, never the reasoning.
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{Key, XChaCha20Poly1305, XNonce};
use curve25519_dalek::edwards::CompressedEdwardsY;
use curve25519_dalek::montgomery::MontgomeryPoint;
use near_sdk::serde_json::{self, Value};
use near_sdk::store::LookupMap;
use near_sdk::{env, log, near, require, BorshStorageKey, PanicOnDefault};

const HKDF_INFO: &[u8] = b"ed25519_encryption";
/// The system message is `<registered prompt><CASE_SEPARATOR><case file JSON>`.
pub const CASE_SEPARATOR: &str = "\n\nBERKAS KASUS: ";
const CONTENT_MARK: &str = "\"content\":\"";
const MAX_EVIDENCE: usize = 2;

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Cases,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Verdict {
    pub rekomendasi: String,
    pub confidence: u8,
    pub curiga_injeksi: bool,
    pub alasan_publik: String,
    pub response_hash: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Case {
    pub transfer_id: String,
    pub amount: String,
    pub case_nonce: String,
    /// sha256 (hex) of each committed evidence envelope string, in commit order.
    pub evidence: Vec<String>,
    pub verdict: Option<Verdict>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    /// Pinned ed25519 signing key of the attested model (attestation checked off-chain).
    signer: [u8; 32],
    /// The same key as an X25519 point, computed here from `signer`.
    signer_x25519: [u8; 32],
    model_id: String,
    prompt_sha256: [u8; 32],
    max_tokens: u32,
    cases: LookupMap<String, Case>,
}

// ---------- helpers ----------

fn unhex(s: &str, what: &str) -> Vec<u8> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    if s.len() % 2 != 0 {
        env::panic_str(&format!("{what}: odd hex length"));
    }
    let val = |c: u8| -> u8 {
        match c {
            b'0'..=b'9' => c - b'0',
            b'a'..=b'f' => c - b'a' + 10,
            b'A'..=b'F' => c - b'A' + 10,
            _ => env::panic_str(&format!("{what}: not hex")),
        }
    };
    s.as_bytes().chunks(2).map(|p| (val(p[0]) << 4) | val(p[1])).collect()
}

fn unhex32(s: &str, what: &str) -> [u8; 32] {
    unhex(s, what).try_into().unwrap_or_else(|_| env::panic_str(&format!("{what} must be 32 bytes")))
}

fn to_hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(DIGITS[(b >> 4) as usize] as char);
        out.push(DIGITS[(b & 15) as usize] as char);
    }
    out
}

/// Envelopes go into the JSON request verbatim, so they must be plain lowercase hex (no quotes).
fn require_lower_hex(s: &str, what: &str) {
    require!(
        !s.is_empty() && s.len() % 2 == 0 && s.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)),
        format!("{what} must be lowercase hex")
    );
}

fn require_plain_id(s: &str, what: &str) {
    require!(
        !s.is_empty() && s.len() <= 64 && s.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_'),
        format!("{what} may only use letters, digits, - and _")
    );
}

fn hmac_sha256(key: &[u8], msg: &[u8]) -> Vec<u8> {
    let mut k = [0u8; 64];
    if key.len() > 64 {
        k[..32].copy_from_slice(&env::sha256(key));
    } else {
        k[..key.len()].copy_from_slice(key);
    }
    let mut inner = Vec::with_capacity(64 + msg.len());
    inner.extend(k.iter().map(|b| b ^ 0x36));
    inner.extend_from_slice(msg);
    let inner_hash = env::sha256(&inner);
    let mut outer = Vec::with_capacity(64 + 32);
    outer.extend(k.iter().map(|b| b ^ 0x5c));
    outer.extend_from_slice(&inner_hash);
    env::sha256(&outer)
}

/// HKDF-SHA256 with an empty salt (= 32 zero bytes, RFC 5869) and a 32-byte output.
fn hkdf32(ikm: &[u8], info: &[u8]) -> [u8; 32] {
    let prk = hmac_sha256(&[0u8; 32], ikm);
    let mut t = info.to_vec();
    t.push(1);
    hmac_sha256(&prk, &t).try_into().unwrap_or_else(|_| env::panic_str("hkdf"))
}

/// Envelope = ephemeral_pub[32] || nonce[24] || ciphertext+tag.
fn decrypt_envelope(blob: &[u8], key: &[u8; 32], what: &str) -> String {
    require!(blob.len() > 32 + 24 + 16, format!("{what}: envelope too short"));
    let nonce: [u8; 24] = blob[32..56].try_into().unwrap_or_else(|_| env::panic_str("nonce"));
    let plain = XChaCha20Poly1305::new(&Key::from(*key))
        .decrypt(&XNonce::from(nonce), &blob[56..])
        .unwrap_or_else(|_| env::panic_str(&format!("{what}: decryption failed")));
    String::from_utf8(plain).unwrap_or_else(|_| env::panic_str(&format!("{what}: not UTF-8")))
}

#[near]
impl Contract {
    #[init]
    pub fn new(signer_pk_hex: String, model_id: String, prompt_sha256_hex: String, max_tokens: u32) -> Self {
        let signer = unhex32(&signer_pk_hex, "signer key");
        let point = CompressedEdwardsY(signer)
            .decompress()
            .unwrap_or_else(|| env::panic_str("signer key is not a valid ed25519 point"));
        require!(
            !model_id.is_empty() && !model_id.contains('"') && !model_id.contains('\\') && !model_id.contains(':'),
            "bad model id"
        );
        Self {
            signer,
            signer_x25519: point.to_montgomery().to_bytes(),
            model_id,
            prompt_sha256: unhex32(&prompt_sha256_hex, "prompt hash"),
            max_tokens,
            cases: LookupMap::new(StorageKey::Cases),
        }
    }

    pub fn get_config(&self) -> Value {
        serde_json::json!({
            "signer": to_hex(&self.signer),
            "signer_x25519": to_hex(&self.signer_x25519),
            "model_id": self.model_id,
            "prompt_sha256": to_hex(&self.prompt_sha256),
            "max_tokens": self.max_tokens,
        })
    }

    pub fn get_case(&self, transfer_id: String) -> Option<Case> {
        self.cases.get(&transfer_id).cloned()
    }

    /// Open a dispute case. The case nonce comes from the block's random seed, so a verdict
    /// written for another case (or before this one existed) cannot be replayed.
    pub fn open_case(&mut self, transfer_id: String, amount: String) -> String {
        require_plain_id(&transfer_id, "transfer id");
        require!(!amount.is_empty() && amount.len() <= 39 && amount.bytes().all(|c| c.is_ascii_digit()), "amount must be digits");
        require!(self.cases.get(&transfer_id).is_none(), "case already open");
        let mut seed = env::random_seed();
        seed.extend_from_slice(transfer_id.as_bytes());
        let case_nonce = to_hex(&env::sha256(&seed)[..16]);
        log!("case {} opened, nonce {}", transfer_id, case_nonce);
        self.cases.insert(
            transfer_id.clone(),
            Case { transfer_id, amount, case_nonce: case_nonce.clone(), evidence: vec![], verdict: None },
        );
        case_nonce
    }

    /// Commit one evidence envelope by its sha256 (hex of the envelope string). Spike: no party or
    /// deadline checks; the product contract restricts this to reporter and receiver, once each.
    pub fn commit_evidence(&mut self, transfer_id: String, envelope_sha256_hex: String) {
        require_lower_hex(&envelope_sha256_hex, "evidence hash");
        require!(envelope_sha256_hex.len() == 64, "evidence hash must be 32 bytes");
        let case = self.cases.get_mut(&transfer_id).unwrap_or_else(|| env::panic_str("unknown case"));
        require!(case.verdict.is_none(), "verdict already posted");
        require!(case.evidence.len() < MAX_EVIDENCE, "evidence list is full");
        case.evidence.push(envelope_sha256_hex);
    }

    /// Anyone may post. Panics unless the TEE model provably read the registered prompt, this case
    /// file and exactly the committed evidence, and the verdict names this case.
    #[allow(clippy::too_many_arguments)]
    pub fn post_recommendation(
        &mut self,
        transfer_id: String,
        signed_text: String,
        signature_hex: String,
        system_envelope: String,
        system_eph_secret_hex: String,
        evidence_envelopes: Vec<String>,
        response_body: String,
        verdict_key_hex: String,
    ) -> Verdict {
        let case = self.cases.get(&transfer_id).cloned().unwrap_or_else(|| env::panic_str("unknown case"));
        require!(case.verdict.is_none(), "verdict already posted");

        // 1) Evidence: exactly the committed envelopes, in commit order.
        require!(
            evidence_envelopes.len() == case.evidence.len(),
            "every committed evidence must be included, and nothing else"
        );
        for (i, e) in evidence_envelopes.iter().enumerate() {
            require_lower_hex(e, "evidence envelope");
            require!(
                to_hex(&env::sha256(e.as_bytes())) == case.evidence[i],
                format!("evidence #{i} does not match its commitment")
            );
        }
        require_lower_hex(&system_envelope, "system envelope");

        // 2) Rebuild the exact request bytes the model must have received.
        let mut request = String::with_capacity(160 + system_envelope.len() + evidence_envelopes.iter().map(|e| e.len() + 32).sum::<usize>());
        request.push_str("{\"model\":\"");
        request.push_str(&self.model_id);
        request.push_str("\",\"messages\":[{\"role\":\"system\",\"content\":\"");
        request.push_str(&system_envelope);
        request.push_str("\"}");
        for e in &evidence_envelopes {
            request.push_str(",{\"role\":\"user\",\"content\":\"");
            request.push_str(e);
            request.push_str("\"}");
        }
        request.push_str("],\"max_tokens\":");
        request.push_str(&self.max_tokens.to_string());
        request.push_str(",\"stream\":false}");

        // 3) TEE signature over MODEL:sha256(request):sha256(response).
        let sig: [u8; 64] = unhex(&signature_hex, "signature")
            .try_into()
            .unwrap_or_else(|_| env::panic_str("signature must be 64 bytes"));
        require!(env::ed25519_verify(&sig, signed_text.as_bytes(), &self.signer), "bad TEE signature");
        let mut parts = signed_text.rsplitn(3, ':');
        let response_hash = parts.next().unwrap_or_default().to_ascii_lowercase();
        let request_hash = parts.next().unwrap_or_default().to_ascii_lowercase();
        require!(parts.next() == Some(self.model_id.as_str()), "signed by a different model (or a gateway signature)");
        require!(
            to_hex(&env::sha256(request.as_bytes())) == request_hash,
            "the model did not receive this exact request (prompt, case file or evidence differs)"
        );
        require!(to_hex(&env::sha256(response_body.as_bytes())) == response_hash, "response does not match the signed hash");

        // 4) Open the system message with a key derived here, exactly as the model derives it.
        let blob = unhex(&system_envelope, "system envelope");
        require!(blob.len() > 32 + 24 + 16, "system envelope too short");
        let eph_secret = unhex32(&system_eph_secret_hex, "ephemeral secret");
        require!(
            MontgomeryPoint::mul_base_clamped(eph_secret).to_bytes()[..] == blob[..32],
            "ephemeral secret does not match the system envelope"
        );
        let shared = MontgomeryPoint(self.signer_x25519).mul_clamped(eph_secret).to_bytes();
        let system = decrypt_envelope(&blob, &hkdf32(&shared, HKDF_INFO), "system message");
        let case_file = format!(
            "{{\"transfer_id\":\"{}\",\"amount\":\"{}\",\"case_nonce\":\"{}\"}}",
            case.transfer_id, case.amount, case.case_nonce
        );
        let suffix = format!("{CASE_SEPARATOR}{case_file}");
        require!(system.ends_with(&suffix), "system message does not carry this case file");
        let prompt = &system[..system.len() - suffix.len()];
        require!(env::sha256(prompt.as_bytes())[..] == self.prompt_sha256[..], "system prompt is not the registered procedure");

        // 5) Open only the `content` field of the response (not the reasoning).
        require!(response_body.matches(CONTENT_MARK).count() == 1, "response must have exactly one content field");
        let start = response_body.find(CONTENT_MARK).unwrap_or_default() + CONTENT_MARK.len();
        let len = response_body[start..].find('"').unwrap_or_else(|| env::panic_str("unterminated content"));
        let content_hex = &response_body[start..start + len];
        require_lower_hex(content_hex, "verdict content");
        let verdict_text = decrypt_envelope(&unhex(content_hex, "verdict"), &unhex32(&verdict_key_hex, "verdict key"), "verdict");
        let v: Value = serde_json::from_str(&verdict_text).unwrap_or_else(|_| env::panic_str("verdict is not JSON"));
        require!(
            v["transfer_id"].as_str() == Some(case.transfer_id.as_str()) && v["case_nonce"].as_str() == Some(case.case_nonce.as_str()),
            "verdict is for another case"
        );
        let verdict = Verdict {
            rekomendasi: v["rekomendasi"].as_str().unwrap_or_default().chars().take(32).collect(),
            confidence: v["confidence"].as_u64().unwrap_or(0).min(100) as u8,
            curiga_injeksi: v["curiga_injeksi"].as_bool().unwrap_or(false),
            alasan_publik: v["alasan_publik"].as_str().unwrap_or_default().chars().take(280).collect(),
            response_hash,
        };
        log!("verdict for case {}: {} ({})", transfer_id, verdict.rekomendasi, verdict.confidence);
        let stored = self.cases.get_mut(&transfer_id).unwrap_or_else(|| env::panic_str("unknown case"));
        stored.verdict = Some(verdict.clone());
        verdict
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    const VECTORS: &str = include_str!("../vectors.json");

    fn vectors() -> Value {
        serde_json::from_str(VECTORS).expect("vectors.json")
    }
    fn s(v: &Value, k: &str) -> String {
        v[k].as_str().unwrap_or_else(|| panic!("missing {k}")).to_string()
    }
    /// Contract with the case opened and both evidence envelopes committed.
    fn setup() -> (Contract, Value) {
        let v = vectors();
        let seed: [u8; 32] = unhex(&s(&v, "random_seed_hex"), "seed").try_into().unwrap();
        testing_env!(VMContextBuilder::new().random_seed(seed).build());
        let mut c = Contract::new(s(&v, "signer_pk_hex"), s(&v, "model_id"), s(&v, "prompt_sha256"), v["max_tokens"].as_u64().unwrap() as u32);
        let nonce = c.open_case(s(&v, "transfer_id"), s(&v, "amount"));
        assert_eq!(nonce, s(&v, "case_nonce"), "nonce derivation differs between JS and Rust");
        for h in v["evidence_sha256"].as_array().unwrap() {
            c.commit_evidence(s(&v, "transfer_id"), h.as_str().unwrap().to_string());
        }
        (c, v)
    }
    fn post(c: &mut Contract, v: &Value, bundle: &str, evidence: Vec<String>) -> Verdict {
        let b = &v["bundles"][bundle];
        c.post_recommendation(
            s(v, "transfer_id"),
            s(b, "signed_text"),
            s(b, "signature_hex"),
            s(b, "system_envelope"),
            s(b, "system_eph_secret_hex"),
            evidence,
            s(b, "response_body"),
            s(b, "verdict_key_hex"),
        )
    }
    fn evidence(v: &Value) -> Vec<String> {
        v["evidence_envelopes"].as_array().unwrap().iter().map(|e| e.as_str().unwrap().to_string()).collect()
    }

    #[test]
    fn x25519_conversion_matches_js() {
        let (c, v) = setup();
        assert_eq!(c.get_config()["signer_x25519"].as_str().unwrap(), s(&v, "signer_x25519_hex"));
    }

    #[test]
    fn honest_court_is_accepted() {
        let (mut c, v) = setup();
        let ev = evidence(&v);
        let out = post(&mut c, &v, "honest", ev);
        assert_eq!(out.rekomendasi, "kembalikan");
        assert!(out.curiga_injeksi);
        assert_eq!(c.get_case(s(&v, "transfer_id")).unwrap().verdict, Some(out));
    }

    #[test]
    #[should_panic(expected = "every committed evidence must be included")]
    fn dropping_the_sellers_evidence_is_rejected() {
        let (mut c, v) = setup();
        let mut ev = evidence(&v);
        ev.pop();
        post(&mut c, &v, "honest", ev);
    }

    #[test]
    #[should_panic(expected = "evidence #0 does not match its commitment")]
    fn reordering_evidence_is_rejected() {
        let (mut c, v) = setup();
        let mut ev = evidence(&v);
        ev.reverse();
        post(&mut c, &v, "honest", ev);
    }

    #[test]
    #[should_panic(expected = "the model did not receive this exact request")]
    fn smuggled_extra_message_is_rejected() {
        // The model really signed a request with an extra instruction message; the contract
        // cannot rebuild that request from the committed pieces.
        let (mut c, v) = setup();
        let ev = evidence(&v);
        post(&mut c, &v, "extra_message", ev);
    }

    #[test]
    #[should_panic(expected = "system prompt is not the registered procedure")]
    fn swapped_prompt_is_rejected() {
        let (mut c, v) = setup();
        let ev = evidence(&v);
        post(&mut c, &v, "wrong_prompt", ev);
    }

    #[test]
    #[should_panic(expected = "system message does not carry this case file")]
    fn case_file_of_another_case_is_rejected() {
        let (mut c, v) = setup();
        let ev = evidence(&v);
        post(&mut c, &v, "wrong_case", ev);
    }

    #[test]
    #[should_panic(expected = "verdict is for another case")]
    fn verdict_naming_another_case_is_rejected() {
        let (mut c, v) = setup();
        let ev = evidence(&v);
        post(&mut c, &v, "other_case_verdict", ev);
    }

    #[test]
    #[should_panic(expected = "ephemeral secret does not match the system envelope")]
    fn wrong_ephemeral_secret_is_rejected() {
        let (mut c, v) = setup();
        let b = &v["bundles"]["honest"];
        c.post_recommendation(
            s(&v, "transfer_id"),
            s(b, "signed_text"),
            s(b, "signature_hex"),
            s(b, "system_envelope"),
            s(&v["bundles"]["wrong_case"], "system_eph_secret_hex"),
            evidence(&v),
            s(b, "response_body"),
            s(b, "verdict_key_hex"),
        );
    }

    #[test]
    #[should_panic(expected = "response does not match the signed hash")]
    fn edited_response_is_rejected() {
        let (mut c, v) = setup();
        let b = &v["bundles"]["honest"];
        c.post_recommendation(
            s(&v, "transfer_id"),
            s(b, "signed_text"),
            s(b, "signature_hex"),
            s(b, "system_envelope"),
            s(b, "system_eph_secret_hex"),
            evidence(&v),
            s(b, "response_body").replacen("chat.completion", "chat.completioN", 1),
            s(b, "verdict_key_hex"),
        );
    }

    #[test]
    #[should_panic(expected = "verdict already posted")]
    fn second_post_is_rejected() {
        let (mut c, v) = setup();
        post(&mut c, &v, "honest", evidence(&v));
        post(&mut c, &v, "honest", evidence(&v));
    }
}
