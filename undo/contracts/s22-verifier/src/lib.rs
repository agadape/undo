//! Spike S22: can a NEAR contract check a NEAR AI Cloud response signature and open the verdict?
//!
//! NEAR AI signs the text `MODEL:sha256(request):sha256(response)` (provider_tee) or
//! `sha256(request):sha256(response)` (gateway) with an ed25519 key held inside the TEE.
//! The attestation that ties that key to the TEE is checked off-chain; the key is pinned at init.
//!
//! - `verify`: the signature matches the pinned key, and the hash of the exact response bytes
//!   (and, if given, the request bytes) matches the signed text.
//! - `open` (feature `decrypt`): the same checks, then decrypts the encrypted content with a
//!   revealed per-message key. Content layout: hex(ephemeral_pub[32] || nonce[24] || ciphertext+tag).
use near_sdk::{env, log, near, require, PanicOnDefault};

#[near(serializers = [json])]
#[derive(Debug, PartialEq)]
pub struct Verified {
    pub model: Option<String>,
    pub request_hash: String,
    pub response_hash: String,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    signer: [u8; 32],
}

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

fn to_hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(DIGITS[(b >> 4) as usize] as char);
        out.push(DIGITS[(b & 15) as usize] as char);
    }
    out
}

#[near]
impl Contract {
    #[init]
    pub fn new(signer_pk_hex: String) -> Self {
        let signer: [u8; 32] = unhex(&signer_pk_hex, "signer key")
            .try_into()
            .unwrap_or_else(|_| env::panic_str("signer key must be 32 bytes"));
        Self { signer }
    }

    pub fn get_signer(&self) -> String {
        to_hex(&self.signer)
    }

    /// Check a signed NEAR AI response. Panics if anything does not match.
    pub fn verify(
        &self,
        signed_text: String,
        signature_hex: String,
        response_body: String,
        request_body: Option<String>,
    ) -> Verified {
        let v = self.check(&signed_text, &signature_hex, &response_body, request_body.as_deref());
        log!("verified response {}", v.response_hash);
        v
    }
}

#[cfg(feature = "decrypt")]
#[near]
impl Contract {
    /// Check a signed response, then decrypt `content_hex` (which must be part of it) with `key_hex`.
    pub fn open(
        &self,
        signed_text: String,
        signature_hex: String,
        response_body: String,
        content_hex: String,
        key_hex: String,
    ) -> String {
        use chacha20poly1305::aead::{Aead, KeyInit};
        use chacha20poly1305::{Key, XChaCha20Poly1305, XNonce};

        self.check(&signed_text, &signature_hex, &response_body, None);
        require!(response_body.contains(content_hex.as_str()), "content is not part of the signed response");
        let blob = unhex(&content_hex, "content");
        require!(blob.len() > 32 + 24 + 16, "content too short");
        let key: [u8; 32] = unhex(&key_hex, "key")
            .try_into()
            .unwrap_or_else(|_| env::panic_str("key must be 32 bytes"));
        let nonce: [u8; 24] = blob[32..56].try_into().unwrap_or_else(|_| env::panic_str("bad nonce"));
        let plain = XChaCha20Poly1305::new(&Key::from(key))
            .decrypt(&XNonce::from(nonce), &blob[56..])
            .unwrap_or_else(|_| env::panic_str("decryption failed: wrong key or tampered content"));
        let text = String::from_utf8(plain).unwrap_or_else(|_| env::panic_str("plaintext is not UTF-8"));
        log!("opened {} bytes", text.len());
        text
    }
}

impl Contract {
    fn check(&self, signed_text: &str, signature_hex: &str, response_body: &str, request_body: Option<&str>) -> Verified {
        let sig: [u8; 64] = unhex(signature_hex, "signature")
            .try_into()
            .unwrap_or_else(|_| env::panic_str("signature must be 64 bytes"));
        require!(env::ed25519_verify(&sig, signed_text.as_bytes(), &self.signer), "bad TEE signature");

        // Last field is the response hash, the one before it the request hash, anything left is the model.
        let mut parts = signed_text.rsplitn(3, ':');
        let response_hash = parts.next().unwrap_or_default().to_ascii_lowercase();
        let request_hash = parts
            .next()
            .unwrap_or_else(|| env::panic_str("signed text has no request hash"))
            .to_ascii_lowercase();
        let model = parts.next().map(str::to_string);

        require!(
            to_hex(&env::sha256(response_body.as_bytes())) == response_hash,
            "response does not match the signed hash"
        );
        if let Some(req) = request_body {
            require!(
                to_hex(&env::sha256(req.as_bytes())) == request_hash,
                "request does not match the signed hash"
            );
        }
        Verified { model, request_hash, response_hash }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::serde_json::{self, Value};

    const VECTORS: &str = include_str!("../vectors.json");

    fn vectors() -> Value {
        serde_json::from_str(VECTORS).expect("vectors.json")
    }
    fn s(v: &Value, k: &str) -> String {
        v[k].as_str().unwrap_or_else(|| panic!("missing {k}")).to_string()
    }
    fn contract() -> (Contract, Value) {
        let v = vectors();
        (Contract::new(s(&v, "signer_pk_hex")), v)
    }
    fn verify_case(c: &Contract, case: &Value, with_request: bool) -> Verified {
        c.verify(
            s(case, "signed_text"),
            s(case, "signature_hex"),
            s(case, "response_body"),
            with_request.then(|| s(case, "request_body")),
        )
    }

    #[test]
    fn provider_tee_signature_verifies() {
        let (c, v) = contract();
        let case = &v["provider_tee"];
        let out = verify_case(&c, case, true);
        assert_eq!(out.model.as_deref(), Some(s(case, "model").as_str()));
        assert_eq!(out.response_hash.len(), 64);
    }

    #[test]
    fn gateway_signature_verifies() {
        let (c, v) = contract();
        let out = verify_case(&c, &v["gateway"], true);
        assert_eq!(out.model, None);
    }

    #[test]
    fn big_payload_verifies() {
        let (c, v) = contract();
        verify_case(&c, &v["big"], true);
    }

    #[test]
    #[should_panic(expected = "response does not match the signed hash")]
    fn edited_response_is_rejected() {
        let (c, v) = contract();
        let case = &v["provider_tee"];
        let body = s(case, "response_body").replacen("chat.completion", "chat.completioN", 1);
        c.verify(s(case, "signed_text"), s(case, "signature_hex"), body, None);
    }

    #[test]
    #[should_panic(expected = "request does not match the signed hash")]
    fn edited_request_is_rejected() {
        let (c, v) = contract();
        let case = &v["provider_tee"];
        let req = s(case, "request_body").replacen("system", "System", 1);
        c.verify(s(case, "signed_text"), s(case, "signature_hex"), s(case, "response_body"), Some(req));
    }

    #[test]
    #[should_panic(expected = "bad TEE signature")]
    fn other_signer_is_rejected() {
        let v = vectors();
        let c = Contract::new(s(&v, "other_signer_pk_hex"));
        verify_case(&c, &v["provider_tee"], false);
    }

    #[test]
    #[should_panic(expected = "bad TEE signature")]
    fn edited_model_id_is_rejected() {
        let (c, v) = contract();
        let case = &v["provider_tee"];
        let text = s(case, "signed_text").replacen(&s(case, "model"), "some/other-model", 1);
        c.verify(text, s(case, "signature_hex"), s(case, "response_body"), None);
    }

    #[cfg(feature = "decrypt")]
    #[test]
    fn opens_the_verdict() {
        let (c, v) = contract();
        let case = &v["provider_tee"];
        let plain = c.open(
            s(case, "signed_text"),
            s(case, "signature_hex"),
            s(case, "response_body"),
            s(case, "content_hex"),
            s(case, "key_hex"),
        );
        assert_eq!(plain, s(case, "plaintext"));
    }

    #[cfg(feature = "decrypt")]
    #[test]
    #[should_panic(expected = "decryption failed")]
    fn wrong_key_is_rejected() {
        let (c, v) = contract();
        let case = &v["provider_tee"];
        c.open(
            s(case, "signed_text"),
            s(case, "signature_hex"),
            s(case, "response_body"),
            s(case, "content_hex"),
            s(&v["gateway"], "key_hex"),
        );
    }

    #[cfg(feature = "decrypt")]
    #[test]
    #[should_panic(expected = "content is not part of the signed response")]
    fn foreign_content_is_rejected() {
        let (c, v) = contract();
        let case = &v["provider_tee"];
        c.open(
            s(case, "signed_text"),
            s(case, "signature_hex"),
            s(case, "response_body"),
            s(&v["gateway"], "content_hex"),
            s(&v["gateway"], "key_hex"),
        );
    }
}
