//! Undo token v2 (rUSDC): wrapped USDC (1:1) whose money can be undone while it is inside its window.
//! v2 adds trusted contacts (T0): a payment to an active contact is final at once. v1 is git tag contract-v1.
//!
//! Promises this contract enforces (PLAN_UNDO.md §1):
//! - J1 Money that is still pending ends at its receiver, or back with the sender side (the sender's
//!   recovery account, else the sender). No function takes a destination address.
//! - J2 Only money inside its window can be touched; after the window it is final.
//! - J3 Nothing is reversed without an active act. AI recommendations never move money. If the council
//!   stays silent, the state the dispute challenged stays: a report → the receiver is paid; a contested
//!   panic freeze → the panic stands.
//! - J4 Only the sender side may report, with a bond. Lost disputes are counted on-chain.
//! - J5 No owner functions. The council is fixed at init.
//! - J6 rUSDC supply = USDC held by this contract (check `get_reserve` against usdc.ft_balance_of).
//! - J7 Court level 2: a recommendation is stored only if the attested model provably read the
//!   registered prompt, this case file and every committed (still encrypted) evidence item.
//! - T0 Trusted contacts: a new contact is active only after `contact_delay` (a thief who adds himself
//!   must wait, and a panic cancels contacts that are not active yet). A payment to an active contact
//!   has no window: it is final at once and cannot be undone (J2 holds: there is no window to touch).
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{Key, XChaCha20Poly1305, XNonce};
use curve25519_dalek::edwards::CompressedEdwardsY;
use curve25519_dalek::montgomery::MontgomeryPoint;
use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{self, json, Value};
use near_sdk::store::LookupMap;
use near_sdk::{
    env, ext_contract, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
    PromiseOrValue,
};

const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_ON_WITHDRAW: Gas = Gas::from_tgas(10);
const MAX_TEXT: usize = 500;
/// Pending outgoing transfers frozen per `panic` call (call again to continue).
const MAX_FREEZE_PER_CALL: usize = 100;
/// Trusted contacts per account.
const MAX_CONTACTS: usize = 20;
const HKDF_INFO: &[u8] = b"ed25519_encryption";
/// The court system message is `<registered prompt><CASE_SEPARATOR><case file JSON>`.
pub const CASE_SEPARATOR: &str = "\n\nBERKAS KASUS: ";
const CONTENT_MARK: &str = "\"content\":\"";

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Balances,
    Accounts,
    Transfers,
    Incoming,
    Outgoing,
    ActiveOut,
    Contacts,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Kind {
    /// rUSDC from one account to another.
    Transfer,
    /// rUSDC leaving as USDC to `to` (an unwrap when `to == from`, `send_usdc` otherwise).
    Exit,
    /// A panic moving the locked account's remaining balance to its recovery account.
    Sweep,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Status {
    /// Inside its window (or, for an Exit, waiting to be withdrawn).
    Pending,
    /// Frozen by a panic; can be contested until `frozen_until`.
    Frozen,
    /// In a dispute; decided by the council or by the timeout.
    Disputed,
    /// Paid to the receiver (or, for an Exit, USDC withdrawn).
    Settled,
    /// Undone: back with the sender side.
    Reversed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Origin {
    /// The sender side says the payment was a scam.
    Report,
    /// Someone contests a panic freeze.
    Contest,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Recommendation {
    pub rekomendasi: String,
    pub confidence: u8,
    pub curiga_injeksi: bool,
    pub alasan_publik: String,
    pub model_id: String,
    pub response_hash: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Dispute {
    pub origin: Origin,
    pub opened_by: AccountId,
    /// What the opener asks for: true = undo the transfer.
    pub wants_reverse: bool,
    /// What council silence means (J3): the state the dispute challenged.
    pub fallback_reverse: bool,
    pub reason: String,
    pub bond: U128,
    pub opened_at: U64,
    pub evidence_deadline: U64,
    pub case_nonce: String,
    /// sha256 (hex) of the sender side's evidence envelope.
    pub evidence_sender: Option<String>,
    /// sha256 (hex) of the receiver side's evidence envelope.
    pub evidence_receiver: Option<String>,
    pub recommendation: Option<Recommendation>,
    pub decided_by: Option<String>,
    pub council_reason: Option<String>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Transfer {
    pub id: U64,
    pub kind: Kind,
    pub from: AccountId,
    pub to: AccountId,
    pub amount: U128,
    pub memo: Option<String>,
    pub created_at: U64,
    pub unlock_at: U64,
    pub status: Status,
    pub frozen_until: Option<U64>,
    pub dispute: Option<Dispute>,
    /// Who finally got the money (set when Settled or Reversed).
    pub final_to: Option<AccountId>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default)]
pub struct AccountState {
    pub recovery: Option<AccountId>,
    /// A scheduled recovery change and when it takes effect (ns).
    pub pending_recovery: Option<(AccountId, U64)>,
    pub locked: bool,
    pub lost_disputes: u32,
}

#[near(serializers = [borsh])]
pub struct Court {
    signer: Option<[u8; 32]>,
    signer_x25519: [u8; 32],
    model_id: String,
    prompt_sha256: Option<[u8; 32]>,
    max_tokens: u32,
}

#[near(serializers = [json])]
pub struct BalanceView {
    /// Spendable now (includes incoming transfers whose window has passed).
    pub available: U128,
    pub pending_in: U128,
    pub frozen_in: U128,
    pub disputed_in: U128,
    pub pending_exit: U128,
    pub locked: bool,
}

#[ext_contract(ext_ft)]
#[allow(dead_code)]
trait FungibleTokenCore {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    underlying: AccountId,
    council: AccountId,
    window_ns: u64,
    contest_window_ns: u64,
    evidence_window_ns: u64,
    dispute_timeout_ns: u64,
    recovery_delay_ns: u64,
    bond: u128,
    storage_fee: u128,
    balances: LookupMap<AccountId, u128>,
    accounts: LookupMap<AccountId, AccountState>,
    transfers: LookupMap<u64, Transfer>,
    /// Incoming transfers not yet final (pending, frozen or disputed).
    incoming: LookupMap<AccountId, Vec<u64>>,
    /// Full outgoing history (for wallets).
    outgoing: LookupMap<AccountId, Vec<u64>>,
    /// Outgoing transfers that may still be undone (pruned on use).
    active_out: LookupMap<AccountId, Vec<u64>>,
    next_id: u64,
    total_supply: u128,
    court: Court,
    contact_delay_ns: u64,
    /// Trusted contacts per account: (contact, active from, ns).
    contacts: LookupMap<AccountId, Vec<(AccountId, u64)>>,
}

// ---------- free helpers ----------

fn emit(event: &str, data: Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({ "standard": "undo", "version": "2.0.0", "event": event, "data": [data] })
    ));
}

fn sec(ns: u64) -> u64 {
    ns / 1_000_000_000
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

fn require_lower_hex(s: &str, what: &str) {
    require!(
        !s.is_empty() && s.len() % 2 == 0 && s.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)),
        format!("{what} must be lowercase hex")
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
    let mut outer = Vec::with_capacity(96);
    outer.extend(k.iter().map(|b| b ^ 0x5c));
    outer.extend_from_slice(&inner_hash);
    env::sha256(&outer)
}

/// HKDF-SHA256, empty salt (= 32 zero bytes), 32-byte output.
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
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        underlying: AccountId,
        council: AccountId,
        window_sec: u32,
        contest_window_sec: u32,
        evidence_window_sec: u32,
        dispute_timeout_sec: u32,
        recovery_delay_sec: u32,
        bond: U128,
        storage_fee: U128,
        contact_delay_sec: Option<u32>,
    ) -> Self {
        let contact_delay_sec = contact_delay_sec.unwrap_or(recovery_delay_sec.max(window_sec));
        for (v, name) in [
            (window_sec, "window"),
            (contest_window_sec, "contest window"),
            (evidence_window_sec, "evidence window"),
            (dispute_timeout_sec, "dispute timeout"),
            (recovery_delay_sec, "recovery delay"),
            (contact_delay_sec, "contact delay"),
        ] {
            require!(v > 0, format!("{name} must be positive"));
        }
        require!(evidence_window_sec < dispute_timeout_sec, "evidence window must end before the dispute timeout");
        // A thief who adds himself as a contact must wait at least as long as a normal pending transfer.
        require!(contact_delay_sec >= window_sec, "contact delay must be at least the window");
        let s = |x: u32| x as u64 * 1_000_000_000;
        Self {
            underlying,
            council,
            window_ns: s(window_sec),
            contest_window_ns: s(contest_window_sec),
            evidence_window_ns: s(evidence_window_sec),
            dispute_timeout_ns: s(dispute_timeout_sec),
            recovery_delay_ns: s(recovery_delay_sec),
            bond: bond.0,
            storage_fee: storage_fee.0,
            balances: LookupMap::new(StorageKey::Balances),
            accounts: LookupMap::new(StorageKey::Accounts),
            transfers: LookupMap::new(StorageKey::Transfers),
            incoming: LookupMap::new(StorageKey::Incoming),
            outgoing: LookupMap::new(StorageKey::Outgoing),
            active_out: LookupMap::new(StorageKey::ActiveOut),
            next_id: 0,
            total_supply: 0,
            court: Court { signer: None, signer_x25519: [0; 32], model_id: String::new(), prompt_sha256: None, max_tokens: 0 },
            contact_delay_ns: s(contact_delay_sec),
            contacts: LookupMap::new(StorageKey::Contacts),
        }
    }

    // ---------- wrap / move / leave ----------

    /// Called by the underlying USDC on `ft_transfer_call`: credits final rUSDC 1:1.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.underlying, "only the underlying token can wrap");
        let _ = msg;
        self.credit(&sender_id, amount.0);
        self.total_supply += amount.0;
        emit("wrap", json!({ "account_id": sender_id, "amount": amount }));
        PromiseOrValue::Value(U128(0))
    }

    /// Send rUSDC. The receiver sees it as pending until the window passes.
    #[payable]
    pub fn transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) -> U64 {
        self.take_fee();
        let sender = env::predecessor_account_id();
        require!(receiver_id != sender, "cannot transfer to yourself");
        if let Some(m) = &memo {
            require!(m.len() <= MAX_TEXT, "memo too long");
        }
        self.spend(&sender, amount.0);
        if self.is_active_contact(&sender, &receiver_id) {
            return U64(self.new_contact_payment(sender, receiver_id, amount.0, memo));
        }
        U64(self.new_transfer(Kind::Transfer, sender, receiver_id, amount.0, memo, Status::Pending))
    }

    /// Unwrap to your own USDC after the window.
    #[payable]
    pub fn unwrap(&mut self, amount: U128) -> U64 {
        self.take_fee();
        let account = env::predecessor_account_id();
        self.spend(&account, amount.0);
        U64(self.new_transfer(Kind::Exit, account.clone(), account, amount.0, None, Status::Pending))
    }

    /// Pay anyone in plain USDC: it arrives after the window. The receiver does not need Undo.
    #[payable]
    pub fn send_usdc(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) -> U64 {
        self.take_fee();
        let sender = env::predecessor_account_id();
        require!(receiver_id != sender, "use unwrap to pay yourself");
        if let Some(m) = &memo {
            require!(m.len() <= MAX_TEXT, "memo too long");
        }
        self.spend(&sender, amount.0);
        // To an active contact the exit has no window: it can be withdrawn at once.
        let contact = self.is_active_contact(&sender, &receiver_id);
        let id = self.new_transfer_with(Kind::Exit, sender.clone(), receiver_id.clone(), amount.0, memo, Status::Pending, contact);
        if contact {
            emit("contact_payment", json!({ "id": U64(id), "kind": "send_usdc", "from": sender, "to": receiver_id, "amount": amount }));
        }
        U64(id)
    }

    /// Finish an Exit whose window has passed. Anyone may call; USDC goes to the Exit's receiver.
    pub fn withdraw(&mut self, transfer_id: U64) -> Promise {
        let now = env::block_timestamp();
        let mut t = self.get(transfer_id.0);
        require!(t.kind == Kind::Exit, "not an exit");
        require!(t.status == Status::Pending, "exit is not pending (frozen, disputed, reversed or withdrawn)");
        require!(now >= t.unlock_at.0, "exit is still inside the undo window");
        t.status = Status::Settled;
        t.final_to = Some(t.to.clone());
        self.total_supply -= t.amount.0;
        let (to, amount) = (t.to.clone(), t.amount.0);
        self.transfers.insert(transfer_id.0, t);
        ext_ft::ext(self.underlying.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(to, U128(amount), Some(format!("undo exit #{}", transfer_id.0)))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_ON_WITHDRAW).on_withdraw(transfer_id))
    }

    #[private]
    pub fn on_withdraw(&mut self, transfer_id: U64) -> bool {
        if env::promise_result_checked(0, 64).is_ok() {
            let t = self.get(transfer_id.0);
            emit("withdraw", json!({ "id": transfer_id, "to": t.to, "amount": t.amount }));
            return true;
        }
        // USDC transfer failed (e.g. receiver not registered on USDC): make it retryable.
        let mut t = self.get(transfer_id.0);
        t.status = Status::Pending;
        t.final_to = None;
        self.total_supply += t.amount.0;
        self.transfers.insert(transfer_id.0, t);
        false
    }

    /// Move every matured incoming transfer of `account_id` into its final balance.
    pub fn settle(&mut self, account_id: AccountId) -> U128 {
        U128(self.settle_internal(&account_id))
    }

    /// "Barang diterima": the sender's recovery account releases a pending payment early.
    /// Only the recovery account may do this, so a stolen main key cannot skip the window.
    pub fn release(&mut self, transfer_id: U64) {
        let now = env::block_timestamp();
        let mut t = self.get(transfer_id.0);
        require!(matches!(t.kind, Kind::Transfer | Kind::Exit), "only payments can be released");
        require!(t.status == Status::Pending && now < t.unlock_at.0, "only pending payments inside the window");
        let caller = env::predecessor_account_id();
        require!(self.current_recovery(&t.from).as_ref() == Some(&caller), "only the sender's recovery account can release early");
        t.unlock_at = U64(now);
        let id = t.id;
        let kind = t.kind;
        let (to, amount) = (t.to.clone(), t.amount.0);
        if kind == Kind::Transfer {
            t.status = Status::Settled;
            t.final_to = Some(to.clone());
            self.transfers.insert(id.0, t);
            self.credit(&to, amount);
        } else {
            self.transfers.insert(id.0, t);
        }
        emit("release", json!({ "id": id, "to": to, "amount": U128(amount) }));
    }

    // ---------- trusted contacts (T0) ----------

    /// Add a trusted contact (attach the storage fee). It becomes active after `contact_delay`; from then
    /// on payments to it are final at once. A panic cancels contacts that are not active yet.
    #[payable]
    pub fn add_contact(&mut self, contact_id: AccountId) -> U64 {
        self.take_fee();
        let owner = env::predecessor_account_id();
        require!(contact_id != owner, "you cannot be your own contact");
        require!(!self.state(&owner).locked, "account is locked (panic)");
        let mut list = self.contacts.get(&owner).cloned().unwrap_or_default();
        require!(!list.iter().any(|(c, _)| *c == contact_id), "already a contact");
        require!(list.len() < MAX_CONTACTS, "at most 20 contacts");
        let at = env::block_timestamp() + self.contact_delay_ns;
        list.push((contact_id.clone(), at));
        self.contacts.insert(owner.clone(), list);
        emit("contact_added", json!({ "account_id": owner, "contact": contact_id, "active_at": U64(at) }));
        U64(at)
    }

    /// Remove a trusted contact. Takes effect at once (it only ever makes the account safer).
    pub fn remove_contact(&mut self, contact_id: AccountId) {
        let owner = env::predecessor_account_id();
        self.drop_contact(&owner, &contact_id, "owner");
    }

    /// The recovery account removes a contact (waiting or active) of the account it protects, without a
    /// panic: e.g. a contact it does not recognise. No deposit, so it can be gasless.
    pub fn cancel_contact(&mut self, account_id: AccountId, contact_id: AccountId) {
        require!(
            self.current_recovery(&account_id).as_ref() == Some(&env::predecessor_account_id()),
            "only the recovery account can cancel a contact"
        );
        self.drop_contact(&account_id, &contact_id, "recovery");
    }

    // ---------- recovery account + panic ----------

    /// Set or change your recovery account. Instant only for an empty account (onboarding);
    /// otherwise it takes effect after the recovery delay and the old recovery account can cancel it.
    pub fn set_recovery(&mut self, recovery_id: AccountId) {
        let account = env::predecessor_account_id();
        require!(recovery_id != account, "the recovery account must be another account");
        let mut st = self.state(&account);
        require!(!st.locked, "account is locked");
        if st.recovery.is_none() && self.is_empty(&account) {
            st.recovery = Some(recovery_id.clone());
            st.pending_recovery = None;
            emit("recovery_set", json!({ "account_id": account, "recovery": recovery_id }));
        } else {
            let at = env::block_timestamp() + self.recovery_delay_ns;
            st.pending_recovery = Some((recovery_id.clone(), U64(at)));
            emit("recovery_scheduled", json!({ "account_id": account, "recovery": recovery_id, "effective_at": U64(at) }));
        }
        self.accounts.insert(account, st);
    }

    /// Cancel a scheduled recovery change. Caller: the current recovery account (or the account
    /// itself if it has none yet).
    pub fn cancel_recovery_change(&mut self, account_id: AccountId) {
        let mut st = self.state(&account_id);
        require!(st.pending_recovery.is_some(), "no scheduled change");
        let allowed = st.recovery.clone().unwrap_or_else(|| account_id.clone());
        require!(env::predecessor_account_id() == allowed, "only the current recovery account can cancel");
        st.pending_recovery = None;
        self.accounts.insert(account_id.clone(), st);
        emit("recovery_change_cancelled", json!({ "account_id": account_id }));
    }

    /// Panic (recovery account only, no deposit, so a function-call key can call it):
    /// lock the account, freeze its pending outgoing transfers, and freeze its remaining balance on
    /// its way to the recovery account. Everything frozen can be contested until `frozen_until`.
    /// Call again to freeze more (at most 100 transfers per call).
    pub fn panic(&mut self, account_id: AccountId) -> Value {
        let recovery = self.current_recovery(&account_id).unwrap_or_else(|| env::panic_str("no recovery account"));
        require!(env::predecessor_account_id() == recovery, "only the recovery account can panic");
        let now = env::block_timestamp();
        let mut st = self.state(&account_id);
        st.recovery = Some(recovery.clone());
        st.locked = true;
        st.pending_recovery = None;
        self.accounts.insert(account_id.clone(), st);
        self.settle_internal(&account_id);

        let ids = self.active_out.get(&account_id).cloned().unwrap_or_default();
        let mut keep = Vec::new();
        let mut frozen = Vec::new();
        for id in ids {
            let Some(t) = self.transfers.get(&id).cloned() else { continue };
            let open = match t.status {
                Status::Pending => now < t.unlock_at.0,
                Status::Frozen | Status::Disputed => true,
                _ => false,
            };
            if !open {
                continue; // final: prune
            }
            if t.status == Status::Pending && t.kind != Kind::Sweep && frozen.len() < MAX_FREEZE_PER_CALL {
                let mut t = t;
                t.status = Status::Frozen;
                t.frozen_until = Some(U64(now + self.contest_window_ns));
                self.transfers.insert(id, t);
                frozen.push(U64(id));
            }
            keep.push(id);
        }
        self.active_out.insert(account_id.clone(), keep);

        let balance = self.balances.get(&account_id).copied().unwrap_or(0);
        let mut sweep = None;
        if balance > 0 {
            self.balances.insert(account_id.clone(), 0);
            let id = self.new_transfer(Kind::Sweep, account_id.clone(), recovery.clone(), balance, None, Status::Frozen);
            let mut t = self.get(id);
            t.frozen_until = Some(U64(now + self.contest_window_ns));
            self.transfers.insert(id, t);
            sweep = Some(U64(id));
        }
        // A contact the thief may have added is not active yet: cancel every contact still waiting.
        let mut contacts_cancelled = 0u32;
        if let Some(list) = self.contacts.get(&account_id).cloned() {
            let keep: Vec<(AccountId, u64)> = list.iter().filter(|(_, at)| *at <= now).cloned().collect();
            contacts_cancelled = (list.len() - keep.len()) as u32;
            for (c, _) in list.iter().filter(|(_, at)| *at > now) {
                emit("contact_removed", json!({ "account_id": account_id, "contact": c, "reason": "panic" }));
            }
            if keep.is_empty() {
                self.contacts.remove(&account_id);
            } else if contacts_cancelled > 0 {
                self.contacts.insert(account_id.clone(), keep);
            }
        }
        let out = json!({ "account_id": account_id, "recovery": recovery, "frozen": frozen, "sweep": sweep, "swept": U128(balance), "contacts_cancelled": contacts_cancelled });
        emit("panic", out.clone());
        out
    }

    /// Unlock an account after its owner has replaced the stolen key (recovery account only).
    pub fn unlock(&mut self, account_id: AccountId) {
        require!(self.current_recovery(&account_id).as_ref() == Some(&env::predecessor_account_id()), "only the recovery account can unlock");
        let mut st = self.state(&account_id);
        require!(st.locked, "account is not locked");
        st.locked = false;
        self.accounts.insert(account_id.clone(), st);
        emit("unlock", json!({ "account_id": account_id }));
    }

    /// Contest a panic freeze (attach exactly the bond). Receiver or sender of a frozen payment;
    /// the account owner for a frozen sweep. Opens a dispute; council silence keeps the panic.
    #[payable]
    pub fn contest(&mut self, transfer_id: U64, reason: String) {
        require!(reason.len() <= MAX_TEXT, "reason too long");
        require!(env::attached_deposit().as_yoctonear() == self.bond, "attach exactly the bond");
        let now = env::block_timestamp();
        let t = self.get(transfer_id.0);
        require!(t.status == Status::Frozen, "only frozen transfers can be contested");
        require!(now < t.frozen_until.map(|x| x.0).unwrap_or(0), "the contest window has closed");
        let caller = env::predecessor_account_id();
        let allowed = match t.kind {
            Kind::Sweep => caller == t.from,
            _ => caller == t.to || caller == t.from,
        };
        require!(allowed, "only the receiver or the account owner can contest");
        // Payments: the contester wants them paid out; a sweep: the owner wants the money back.
        let wants_reverse = t.kind == Kind::Sweep;
        self.open_dispute(t, Origin::Contest, caller, wants_reverse, !wants_reverse, reason);
    }

    /// Apply an uncontested freeze after its contest window: payments go back to the recovery
    /// account, a sweep reaches it. Anyone may call (optimistic undo, no vote).
    pub fn finalize(&mut self, transfer_id: U64) {
        let t = self.get(transfer_id.0);
        require!(t.status == Status::Frozen, "transfer is not frozen");
        require!(env::block_timestamp() >= t.frozen_until.map(|x| x.0).unwrap_or(u64::MAX), "the contest window is still open");
        let reverse = t.kind != Kind::Sweep;
        self.apply(t, reverse, "finalize");
    }

    // ---------- disputes ----------

    /// Report a pending payment as a scam (attach exactly the bond). Sender or its recovery account
    /// only; for your own unwrap only the recovery account. Council silence pays the receiver.
    #[payable]
    pub fn report(&mut self, transfer_id: U64, reason: String) {
        require!(reason.len() <= MAX_TEXT, "reason too long");
        require!(env::attached_deposit().as_yoctonear() == self.bond, "attach exactly the bond");
        let now = env::block_timestamp();
        let t = self.get(transfer_id.0);
        require!(matches!(t.kind, Kind::Transfer | Kind::Exit), "only payments can be reported");
        require!(t.status == Status::Pending, "only pending transfers can be reported");
        require!(now < t.unlock_at.0, "the undo window has closed");
        let caller = env::predecessor_account_id();
        let recovery = self.current_recovery(&t.from);
        let own_unwrap = t.kind == Kind::Exit && t.to == t.from;
        let by_sender = caller == t.from && !own_unwrap && !self.state(&t.from).locked;
        require!(by_sender || recovery.as_ref() == Some(&caller), "only the sender or its recovery account can report");
        self.open_dispute(t, Origin::Report, caller, true, false, reason);
    }

    /// Commit the sha256 (hex) of your evidence envelope, once per side, before the evidence deadline.
    pub fn commit_evidence(&mut self, transfer_id: U64, envelope_sha256_hex: String) {
        require_lower_hex(&envelope_sha256_hex, "evidence hash");
        require!(envelope_sha256_hex.len() == 64, "evidence hash must be 32 bytes");
        let mut t = self.get(transfer_id.0);
        require!(t.status == Status::Disputed, "transfer is not disputed");
        let caller = env::predecessor_account_id();
        let sender_side = self.is_sender_side(&t, &caller);
        let receiver_side = self.is_receiver_side(&t, &caller);
        let d = t.dispute.as_mut().unwrap_or_else(|| env::panic_str("missing dispute"));
        require!(env::block_timestamp() < d.evidence_deadline.0, "the evidence deadline has passed");
        require!(sender_side != receiver_side, "only one party of this dispute can commit evidence");
        let slot = if sender_side { &mut d.evidence_sender } else { &mut d.evidence_receiver };
        require!(slot.is_none(), "this side already committed evidence");
        *slot = Some(envelope_sha256_hex.clone());
        let id = t.id;
        self.transfers.insert(id.0, t);
        emit("evidence", json!({ "id": id, "by": caller, "side": if sender_side { "pengirim" } else { "penerima" }, "sha256": envelope_sha256_hex }));
    }

    /// Store a TEE recommendation (anyone may post; the court server needs no trust). Panics unless
    /// the attested model provably read the registered prompt, this case file and exactly the
    /// committed evidence (sender side first). Never moves money (J3).
    #[allow(clippy::too_many_arguments)]
    pub fn post_recommendation(
        &mut self,
        transfer_id: U64,
        signed_text: String,
        signature_hex: String,
        system_envelope: String,
        system_eph_secret_hex: String,
        evidence_envelopes: Vec<String>,
        response_body: String,
        verdict_key_hex: String,
    ) -> Recommendation {
        let signer = self.court.signer.unwrap_or_else(|| env::panic_str("no TEE signer registered"));
        let prompt_sha256 = self.court.prompt_sha256.unwrap_or_else(|| env::panic_str("no court procedure registered"));
        let mut t = self.get(transfer_id.0);
        require!(t.status == Status::Disputed, "transfer is not disputed");
        let d = t.dispute.clone().unwrap_or_else(|| env::panic_str("missing dispute"));
        require!(d.recommendation.is_none(), "a recommendation is already stored");
        let both = d.evidence_sender.is_some() && d.evidence_receiver.is_some();
        require!(both || env::block_timestamp() >= d.evidence_deadline.0, "wait for the evidence deadline (or both sides' evidence)");

        // 1) Evidence: exactly the committed envelopes, sender side first.
        let committed: Vec<(&str, &String)> = [("pengirim", &d.evidence_sender), ("penerima", &d.evidence_receiver)]
            .into_iter()
            .filter_map(|(side, h)| h.as_ref().map(|h| (side, h)))
            .collect();
        require!(evidence_envelopes.len() == committed.len(), "every committed evidence must be included, and nothing else");
        for (i, e) in evidence_envelopes.iter().enumerate() {
            require_lower_hex(e, "evidence envelope");
            require!(to_hex(&env::sha256(e.as_bytes())) == *committed[i].1, format!("evidence #{i} does not match its commitment"));
        }
        require_lower_hex(&system_envelope, "system envelope");

        // 2) Rebuild the exact request bytes the model must have received.
        let mut request = String::with_capacity(160 + system_envelope.len() + evidence_envelopes.iter().map(|e| e.len() + 32).sum::<usize>());
        request.push_str("{\"model\":\"");
        request.push_str(&self.court.model_id);
        request.push_str("\",\"messages\":[{\"role\":\"system\",\"content\":\"");
        request.push_str(&system_envelope);
        request.push_str("\"}");
        for e in &evidence_envelopes {
            request.push_str(",{\"role\":\"user\",\"content\":\"");
            request.push_str(e);
            request.push_str("\"}");
        }
        request.push_str("],\"max_tokens\":");
        request.push_str(&self.court.max_tokens.to_string());
        request.push_str(",\"stream\":false}");

        // 3) TEE signature over MODEL:sha256(request):sha256(response).
        let sig: [u8; 64] = unhex(&signature_hex, "signature").try_into().unwrap_or_else(|_| env::panic_str("signature must be 64 bytes"));
        require!(env::ed25519_verify(&sig, signed_text.as_bytes(), &signer), "bad TEE signature");
        let mut parts = signed_text.rsplitn(3, ':');
        let response_hash = parts.next().unwrap_or_default().to_ascii_lowercase();
        let request_hash = parts.next().unwrap_or_default().to_ascii_lowercase();
        require!(parts.next() == Some(self.court.model_id.as_str()), "signed by a different model (or a gateway signature)");
        require!(
            to_hex(&env::sha256(request.as_bytes())) == request_hash,
            "the model did not receive this exact request (prompt, case file or evidence differs)"
        );
        require!(to_hex(&env::sha256(response_body.as_bytes())) == response_hash, "response does not match the signed hash");

        // 4) Open the system message with a key derived here, exactly as the model derives it.
        let blob = unhex(&system_envelope, "system envelope");
        require!(blob.len() > 32 + 24 + 16, "system envelope too short");
        let eph_secret = unhex32(&system_eph_secret_hex, "ephemeral secret");
        require!(MontgomeryPoint::mul_base_clamped(eph_secret).to_bytes()[..] == blob[..32], "ephemeral secret does not match the system envelope");
        let shared = MontgomeryPoint(self.court.signer_x25519).mul_clamped(eph_secret).to_bytes();
        let system = decrypt_envelope(&blob, &hkdf32(&shared, HKDF_INFO), "system message");
        let order: Vec<String> = committed.iter().map(|(side, _)| format!("\"{side}\"")).collect();
        let case_file = format!(
            "{{\"transfer_id\":\"{}\",\"jenis\":\"{}\",\"amount\":\"{}\",\"case_nonce\":\"{}\",\"urutan_bukti\":[{}]}}",
            t.id.0,
            if d.origin == Origin::Report { "laporan" } else { "bantahan" },
            t.amount.0,
            d.case_nonce,
            order.join(",")
        );
        let suffix = format!("{CASE_SEPARATOR}{case_file}");
        require!(system.ends_with(&suffix), "system message does not carry this case file");
        require!(
            env::sha256(system[..system.len() - suffix.len()].as_bytes())[..] == prompt_sha256[..],
            "system prompt is not the registered procedure"
        );

        // 5) Open only the `content` field (the verdict), never the reasoning.
        require!(response_body.matches(CONTENT_MARK).count() == 1, "response must have exactly one content field");
        let start = response_body.find(CONTENT_MARK).unwrap_or_default() + CONTENT_MARK.len();
        let len = response_body[start..].find('"').unwrap_or_else(|| env::panic_str("unterminated content"));
        let content_hex = &response_body[start..start + len];
        require_lower_hex(content_hex, "verdict content");
        let verdict = decrypt_envelope(&unhex(content_hex, "verdict"), &unhex32(&verdict_key_hex, "verdict key"), "verdict");
        let v: Value = serde_json::from_str(&verdict).unwrap_or_else(|_| env::panic_str("verdict is not JSON"));
        let id_str = t.id.0.to_string();
        require!(
            v["transfer_id"].as_str() == Some(id_str.as_str()) && v["case_nonce"].as_str() == Some(d.case_nonce.as_str()),
            "verdict is for another case"
        );
        let rec = Recommendation {
            rekomendasi: v["rekomendasi"].as_str().unwrap_or_default().chars().take(32).collect(),
            confidence: v["confidence"].as_u64().unwrap_or(0).min(100) as u8,
            curiga_injeksi: v["curiga_injeksi"].as_bool().unwrap_or(false),
            alasan_publik: v["alasan_publik"].as_str().unwrap_or_default().chars().take(280).collect(),
            model_id: self.court.model_id.clone(),
            response_hash,
        };
        if let Some(dd) = t.dispute.as_mut() {
            dd.recommendation = Some(rec.clone());
        }
        self.transfers.insert(transfer_id.0, t);
        emit("recommendation", json!({ "id": transfer_id, "rekomendasi": rec.rekomendasi, "confidence": rec.confidence, "curiga_injeksi": rec.curiga_injeksi }));
        rec
    }

    /// Council decision on a dispute (Sputnik DAO). `reverse = true` undoes the transfer.
    /// There is no destination argument: the contract decides where the money goes (J1).
    pub fn resolve(&mut self, transfer_id: U64, reverse: bool, reason: String) {
        require!(env::predecessor_account_id() == self.council, "only the council can resolve");
        require!(reason.len() <= MAX_TEXT, "reason too long");
        let mut t = self.get(transfer_id.0);
        require!(t.status == Status::Disputed, "transfer is not disputed");
        if let Some(d) = t.dispute.as_mut() {
            d.council_reason = Some(reason);
        }
        self.apply(t, reverse, "council");
    }

    /// After the dispute timeout, anyone can apply what council silence means (J3).
    pub fn release_expired(&mut self, transfer_id: U64) {
        let t = self.get(transfer_id.0);
        require!(t.status == Status::Disputed, "transfer is not disputed");
        let d = t.dispute.clone().unwrap_or_else(|| env::panic_str("missing dispute"));
        require!(env::block_timestamp() >= d.opened_at.0 + self.dispute_timeout_ns, "the council still has time");
        self.apply(t, d.fallback_reverse, "timeout");
    }

    /// Council: pin the attested model's ed25519 signing key (attestation checked off-chain).
    pub fn register_tee_signer(&mut self, model_id: String, signer_pk_hex: String) {
        require!(env::predecessor_account_id() == self.council, "only the council can register the TEE signer");
        require!(!model_id.is_empty() && !model_id.contains(['"', '\\', ':']), "bad model id");
        let signer = unhex32(&signer_pk_hex, "signer key");
        let point = CompressedEdwardsY(signer).decompress().unwrap_or_else(|| env::panic_str("signer key is not a valid ed25519 point"));
        self.court.signer = Some(signer);
        self.court.signer_x25519 = point.to_montgomery().to_bytes();
        self.court.model_id = model_id.clone();
        emit("tee_signer", json!({ "model_id": model_id, "signer": to_hex(&signer) }));
    }

    /// Council: register the court procedure (sha256 of the published system prompt + max_tokens).
    pub fn register_procedure(&mut self, prompt_sha256_hex: String, max_tokens: u32) {
        require!(env::predecessor_account_id() == self.council, "only the council can register the procedure");
        require!(max_tokens > 0, "max_tokens must be positive");
        self.court.prompt_sha256 = Some(unhex32(&prompt_sha256_hex, "prompt hash"));
        self.court.max_tokens = max_tokens;
        emit("procedure", json!({ "prompt_sha256": prompt_sha256_hex, "max_tokens": max_tokens }));
    }

    // ---------- views ----------

    pub fn get_config(&self) -> Value {
        json!({
            "underlying": self.underlying,
            "council": self.council,
            "window_sec": sec(self.window_ns),
            "contest_window_sec": sec(self.contest_window_ns),
            "evidence_window_sec": sec(self.evidence_window_ns),
            "dispute_timeout_sec": sec(self.dispute_timeout_ns),
            "recovery_delay_sec": sec(self.recovery_delay_ns),
            "contact_delay_sec": sec(self.contact_delay_ns),
            "bond": U128(self.bond),
            "storage_fee": U128(self.storage_fee),
            "total_supply": U128(self.total_supply),
            "next_id": U64(self.next_id),
            "court": {
                "model_id": self.court.model_id,
                "signer": self.court.signer.map(|s| to_hex(&s)),
                "signer_x25519": to_hex(&self.court.signer_x25519),
                "prompt_sha256": self.court.prompt_sha256.map(|s| to_hex(&s)),
                "max_tokens": self.court.max_tokens,
            },
        })
    }

    /// J6: compare `total_supply` with `ft_balance_of(this contract)` on the underlying USDC.
    pub fn get_reserve(&self) -> Value {
        json!({ "total_supply": U128(self.total_supply), "underlying": self.underlying, "holder": env::current_account_id() })
    }

    /// Trusted contacts of an account: [{contact, active_at (ns), active}].
    pub fn get_contacts(&self, account_id: AccountId) -> Vec<Value> {
        let now = env::block_timestamp();
        self.contacts
            .get(&account_id)
            .map(|l| l.iter().map(|(c, at)| json!({ "contact": c, "active_at": U64(*at), "active": *at <= now })).collect())
            .unwrap_or_default()
    }

    pub fn get_account(&self, account_id: AccountId) -> Value {
        let st = self.state(&account_id);
        json!({
            "recovery": st.recovery,
            "pending_recovery": st.pending_recovery,
            "locked": st.locked,
            "lost_disputes": st.lost_disputes,
        })
    }

    pub fn get_reputation(&self, account_id: AccountId) -> u32 {
        self.accounts.get(&account_id).map(|s| s.lost_disputes).unwrap_or(0)
    }

    pub fn balance_of(&self, account_id: AccountId) -> BalanceView {
        let now = env::block_timestamp();
        let mut available = self.balances.get(&account_id).copied().unwrap_or(0);
        let (mut pending_in, mut frozen_in, mut disputed_in, mut pending_exit) = (0u128, 0u128, 0u128, 0u128);
        for id in self.incoming.get(&account_id).map(|v| v.as_slice()).unwrap_or(&[]) {
            if let Some(t) = self.transfers.get(id) {
                match t.status {
                    Status::Pending if now >= t.unlock_at.0 => available += t.amount.0,
                    Status::Pending => pending_in += t.amount.0,
                    Status::Frozen => frozen_in += t.amount.0,
                    Status::Disputed => disputed_in += t.amount.0,
                    _ => {}
                }
            }
        }
        for id in self.active_out.get(&account_id).map(|v| v.as_slice()).unwrap_or(&[]) {
            if let Some(t) = self.transfers.get(id) {
                if t.kind == Kind::Exit && t.to == t.from && matches!(t.status, Status::Pending | Status::Frozen | Status::Disputed) {
                    pending_exit += t.amount.0;
                }
            }
        }
        BalanceView {
            available: U128(available),
            pending_in: U128(pending_in),
            frozen_in: U128(frozen_in),
            disputed_in: U128(disputed_in),
            pending_exit: U128(pending_exit),
            locked: self.accounts.get(&account_id).map(|s| s.locked).unwrap_or(false),
        }
    }

    pub fn get_transfer(&self, transfer_id: U64) -> Option<Transfer> {
        self.transfers.get(&transfer_id.0).cloned()
    }

    pub fn get_incoming(&self, account_id: AccountId) -> Vec<Transfer> {
        self.incoming.get(&account_id).map(|v| v.iter().filter_map(|id| self.transfers.get(id).cloned()).collect()).unwrap_or_default()
    }

    pub fn get_outgoing(&self, account_id: AccountId, limit: Option<u32>) -> Vec<Transfer> {
        let limit = limit.unwrap_or(20).min(100) as usize;
        let ids: Vec<u64> = self.outgoing.get(&account_id).map(|v| v.iter().rev().take(limit).copied().collect()).unwrap_or_default();
        ids.iter().filter_map(|id| self.transfers.get(id).cloned()).collect()
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.balance_of(account_id).available
    }

    pub fn ft_total_supply(&self) -> U128 {
        U128(self.total_supply)
    }

    pub fn ft_metadata(&self) -> Value {
        json!({ "spec": "ft-1.0.0", "name": "Undo wrapped USDC (testnet)", "symbol": "rUSDC", "decimals": 6 })
    }
}

// ---------- internal ----------

impl Contract {
    fn get(&self, id: u64) -> Transfer {
        self.transfers.get(&id).cloned().unwrap_or_else(|| env::panic_str("unknown transfer"))
    }

    fn state(&self, account: &AccountId) -> AccountState {
        let mut st = self.accounts.get(account).cloned().unwrap_or_default();
        // Materialize a scheduled recovery change that has taken effect (never while locked).
        if let Some((r, at)) = st.pending_recovery.clone() {
            if !st.locked && env::block_timestamp() >= at.0 {
                st.recovery = Some(r);
                st.pending_recovery = None;
            }
        }
        st
    }

    fn current_recovery(&self, account: &AccountId) -> Option<AccountId> {
        self.state(account).recovery
    }

    /// J1: where undone money goes — the sender's recovery account, else the sender.
    fn refund_dest(&self, t: &Transfer) -> AccountId {
        match t.kind {
            Kind::Sweep => t.from.clone(),
            _ => self.current_recovery(&t.from).unwrap_or_else(|| t.from.clone()),
        }
    }

    fn dest(&self, t: &Transfer, reverse: bool) -> AccountId {
        if reverse { self.refund_dest(t) } else { t.to.clone() }
    }

    fn is_sender_side(&self, t: &Transfer, who: &AccountId) -> bool {
        let own_unwrap = t.kind == Kind::Exit && t.to == t.from;
        match t.kind {
            Kind::Sweep => *who == t.from,
            _ => (*who == t.from && !own_unwrap) || self.current_recovery(&t.from).as_ref() == Some(who),
        }
    }

    fn is_receiver_side(&self, t: &Transfer, who: &AccountId) -> bool {
        *who == t.to && !(t.kind == Kind::Exit && t.to == t.from && self.current_recovery(&t.from).as_ref() == Some(who))
    }

    fn take_fee(&self) {
        let fee = self.storage_fee.max(1);
        require!(env::attached_deposit().as_yoctonear() == fee, format!("attach exactly {fee} yoctoNEAR (storage fee)"));
    }

    /// Debit for a new outgoing transfer: settles matured incoming first, refuses locked accounts.
    fn spend(&mut self, account: &AccountId, amount: u128) {
        require!(amount > 0, "amount must be positive");
        require!(!self.state(account).locked, "account is locked (panic)");
        self.settle_internal(account);
        let b = self.balances.get(account).copied().unwrap_or(0);
        require!(b >= amount, "not enough available rUSDC (incoming funds unlock after the undo window)");
        self.balances.insert(account.clone(), b - amount);
    }

    fn credit(&mut self, account: &AccountId, amount: u128) {
        let b = self.balances.get(account).copied().unwrap_or(0);
        self.balances.insert(account.clone(), b + amount);
    }

    fn is_empty(&self, account: &AccountId) -> bool {
        let now = env::block_timestamp();
        let raw = self.balances.get(account).copied().unwrap_or(0);
        let busy_in = self.incoming.get(account).map(|v| !v.is_empty()).unwrap_or(false);
        let busy_out = self
            .active_out
            .get(account)
            .map(|v| {
                v.iter().any(|id| {
                    self.transfers.get(id).map(|t| matches!(t.status, Status::Frozen | Status::Disputed) || (t.status == Status::Pending && now < t.unlock_at.0)).unwrap_or(false)
                })
            })
            .unwrap_or(false);
        raw == 0 && !busy_in && !busy_out
    }

    fn drop_contact(&mut self, owner: &AccountId, contact_id: &AccountId, reason: &str) {
        let mut list = self.contacts.get(owner).cloned().unwrap_or_default();
        let before = list.len();
        list.retain(|(c, _)| c != contact_id);
        require!(list.len() < before, "not a contact");
        if list.is_empty() {
            self.contacts.remove(owner);
        } else {
            self.contacts.insert(owner.clone(), list);
        }
        emit("contact_removed", json!({ "account_id": owner, "contact": contact_id, "reason": reason }));
    }

    fn is_active_contact(&self, owner: &AccountId, to: &AccountId) -> bool {
        let now = env::block_timestamp();
        self.contacts.get(owner).map(|l| l.iter().any(|(c, at)| c == to && *at <= now)).unwrap_or(false)
    }

    /// A payment to an active trusted contact: final at once (Settled, credited now, never in a window).
    fn new_contact_payment(&mut self, from: AccountId, to: AccountId, amount: u128, memo: Option<String>) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        let now = env::block_timestamp();
        let t = Transfer {
            id: U64(id),
            kind: Kind::Transfer,
            from: from.clone(),
            to: to.clone(),
            amount: U128(amount),
            memo,
            created_at: U64(now),
            unlock_at: U64(now),
            status: Status::Settled,
            frozen_until: None,
            dispute: None,
            final_to: Some(to.clone()),
        };
        self.transfers.insert(id, t);
        self.outgoing.entry(from.clone()).or_default().push(id);
        self.credit(&to, amount);
        emit("contact_payment", json!({ "id": U64(id), "kind": "transfer", "from": from, "to": to, "amount": U128(amount) }));
        id
    }

    fn new_transfer(&mut self, kind: Kind, from: AccountId, to: AccountId, amount: u128, memo: Option<String>, status: Status) -> u64 {
        self.new_transfer_with(kind, from, to, amount, memo, status, false)
    }

    /// `instant`: no window (an exit to an active trusted contact).
    #[allow(clippy::too_many_arguments)]
    fn new_transfer_with(&mut self, kind: Kind, from: AccountId, to: AccountId, amount: u128, memo: Option<String>, status: Status, instant: bool) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        let now = env::block_timestamp();
        let t = Transfer {
            id: U64(id),
            kind,
            from: from.clone(),
            to: to.clone(),
            amount: U128(amount),
            memo,
            created_at: U64(now),
            unlock_at: U64(if kind == Kind::Sweep || instant { now } else { now + self.window_ns }),
            status,
            frozen_until: None,
            dispute: None,
            final_to: None,
        };
        let event = match kind {
            Kind::Transfer => "transfer",
            Kind::Exit if to == from => "unwrap",
            Kind::Exit => "send_usdc",
            Kind::Sweep => "sweep",
        };
        emit(event, json!({ "id": U64(id), "from": from, "to": to, "amount": U128(amount), "unlock_at": t.unlock_at }));
        self.transfers.insert(id, t);
        if kind != Kind::Exit {
            self.incoming.entry(to).or_default().push(id);
        }
        self.outgoing.entry(from.clone()).or_default().push(id);
        self.active_out.entry(from).or_default().push(id);
        id
    }

    fn open_dispute(&mut self, mut t: Transfer, origin: Origin, by: AccountId, wants_reverse: bool, fallback_reverse: bool, reason: String) {
        let now = env::block_timestamp();
        let mut seed = env::random_seed();
        seed.extend_from_slice(t.id.0.to_string().as_bytes());
        let case_nonce = to_hex(&env::sha256(&seed)[..16]);
        t.status = Status::Disputed;
        t.dispute = Some(Dispute {
            origin,
            opened_by: by.clone(),
            wants_reverse,
            fallback_reverse,
            reason: reason.clone(),
            bond: U128(self.bond),
            opened_at: U64(now),
            evidence_deadline: U64(now + self.evidence_window_ns),
            case_nonce: case_nonce.clone(),
            evidence_sender: None,
            evidence_receiver: None,
            recommendation: None,
            decided_by: None,
            council_reason: None,
        });
        let id = t.id;
        self.transfers.insert(id.0, t);
        emit(
            if origin == Origin::Report { "report" } else { "contest" },
            json!({ "id": id, "by": by, "reason": reason, "case_nonce": case_nonce }),
        );
    }

    /// Move the money of a transfer to its final place. `reverse = true` undoes it (J1 destinations only).
    fn apply(&mut self, mut t: Transfer, reverse: bool, by: &str) {
        let dest = self.dest(&t, reverse);
        let other = self.dest(&t, !reverse);
        let amount = t.amount.0;
        match (t.kind, reverse) {
            (Kind::Exit, false) => {
                // Paid out as USDC: withdrawable right away.
                t.status = Status::Pending;
                t.unlock_at = U64(env::block_timestamp());
            }
            (_, false) => {
                t.status = Status::Settled;
                t.final_to = Some(dest.clone());
                self.credit(&dest, amount);
            }
            (_, true) => {
                t.status = Status::Reversed;
                t.final_to = Some(dest.clone());
                self.credit(&dest, amount);
            }
        }
        if let Some(d) = t.dispute.as_mut() {
            d.decided_by = Some(by.to_string());
            let bond = d.bond.0;
            let opener_won = reverse == d.wants_reverse;
            if bond > 0 {
                let to = if opener_won { d.opened_by.clone() } else { dest.clone() };
                Promise::new(to).transfer(NearToken::from_yoctonear(bond)).detach();
            }
            if by == "council" {
                let loser = if opener_won { other } else { d.opened_by.clone() };
                let mut st = self.accounts.get(&loser).cloned().unwrap_or_default();
                st.lost_disputes += 1;
                self.accounts.insert(loser, st);
            }
        }
        let id = t.id;
        self.transfers.insert(id.0, t);
        emit(
            if reverse { "reverse" } else { "release" },
            json!({ "id": id, "to": dest, "amount": U128(amount), "by": by }),
        );
    }

    /// Settle matured incoming transfers for `account`. Returns the amount credited.
    fn settle_internal(&mut self, account: &AccountId) -> u128 {
        let now = env::block_timestamp();
        let ids = match self.incoming.get(account) {
            Some(v) => v.clone(),
            None => return 0,
        };
        let mut keep = Vec::new();
        let mut credited = 0u128;
        for id in ids {
            let Some(t) = self.transfers.get(&id).cloned() else { continue };
            match t.status {
                Status::Pending if now >= t.unlock_at.0 => {
                    let mut t = t;
                    t.status = Status::Settled;
                    t.final_to = Some(account.clone());
                    credited += t.amount.0;
                    self.transfers.insert(id, t);
                }
                Status::Pending | Status::Frozen | Status::Disputed => keep.push(id),
                _ => {}
            }
        }
        self.incoming.insert(account.clone(), keep);
        if credited > 0 {
            self.credit(account, credited);
            emit("settle", json!({ "account_id": account, "amount": U128(credited) }));
        }
        credited
    }
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod fuzz_tests;
