//! Undo token (rUSDC): a USDC wrapper where every transfer has an undo window.
//!
//! - Wrapping is instant: USDC sent with `ft_transfer_call` becomes final rUSDC.
//! - A transfer is pending until `unlock_at`; only then does the receiver get final balance.
//! - Leaving (unwrap) also waits for the window, so a thief holding a stolen key cannot exit at once.
//! - Anyone can report a pending transfer by attaching the report bond. That freezes it.
//! - A judge account (AI verdict poster) can attach an attested verdict for transparency.
//! - Only the council (a Sputnik DAO) can resolve a dispute: reverse it or release it.
//! - If the council stays silent past `dispute_timeout`, the funds are released to the receiver.
use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{json, Value};
use near_sdk::store::LookupMap;
use near_sdk::{
    assert_one_yocto, env, ext_contract, near, require, AccountId, BorshStorageKey, Gas, NearToken,
    PanicOnDefault, Promise, PromiseOrValue,
};

const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_ON_WITHDRAW: Gas = Gas::from_tgas(10);
const MAX_TEXT: usize = 500;

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Balances,
    Transfers,
    Incoming,
    Outgoing,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Kind {
    /// rUSDC moving from one account to another.
    Transfer,
    /// rUSDC leaving the contract as USDC (unwrap).
    Exit,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Status {
    Pending,
    Disputed,
    Settled,
    Reversed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Verdict {
    pub stolen: bool,
    pub confidence: u8,
    pub model: String,
    pub request_hash: String,
    pub response_hash: String,
    pub signature: String,
    pub posted_at: U64,
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
    pub reporter: Option<AccountId>,
    pub report_reason: Option<String>,
    pub reported_at: Option<U64>,
    pub bond: U128,
    pub verdict: Option<Verdict>,
    pub refund_to: Option<AccountId>,
}

#[near(serializers = [json])]
pub struct BalanceView {
    /// Spendable now (includes pending transfers whose window already passed).
    pub available: U128,
    /// Incoming transfers still inside the undo window.
    pub pending_in: U128,
    /// Incoming transfers frozen by a report.
    pub disputed_in: U128,
    /// Unwraps waiting for their window.
    pub pending_exit: U128,
}

#[near(serializers = [json])]
pub struct Config {
    pub owner: AccountId,
    pub underlying: AccountId,
    pub council: AccountId,
    pub judge: AccountId,
    pub window_sec: u32,
    pub dispute_timeout_sec: u32,
    pub report_bond: U128,
    pub total_supply: U128,
    pub next_id: U64,
}

#[ext_contract(ext_ft)]
#[allow(dead_code)]
trait FungibleTokenCore {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    underlying: AccountId,
    council: AccountId,
    judge: AccountId,
    window_ns: u64,
    dispute_timeout_ns: u64,
    report_bond: u128,
    balances: LookupMap<AccountId, u128>,
    transfers: LookupMap<u64, Transfer>,
    incoming: LookupMap<AccountId, Vec<u64>>,
    outgoing: LookupMap<AccountId, Vec<u64>>,
    next_id: u64,
    total_supply: u128,
}

fn emit(event: &str, data: Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({ "standard": "undo", "version": "0.1.0", "event": event, "data": [data] })
    ));
}

#[near]
impl Contract {
    #[init]
    pub fn new(
        underlying: AccountId,
        council: AccountId,
        judge: AccountId,
        window_sec: u32,
        dispute_timeout_sec: u32,
        report_bond: U128,
    ) -> Self {
        require!(window_sec > 0, "window must be positive");
        require!(dispute_timeout_sec > 0, "dispute timeout must be positive");
        Self {
            owner: env::predecessor_account_id(),
            underlying,
            council,
            judge,
            window_ns: window_sec as u64 * 1_000_000_000,
            dispute_timeout_ns: dispute_timeout_sec as u64 * 1_000_000_000,
            report_bond: report_bond.0,
            balances: LookupMap::new(StorageKey::Balances),
            transfers: LookupMap::new(StorageKey::Transfers),
            incoming: LookupMap::new(StorageKey::Incoming),
            outgoing: LookupMap::new(StorageKey::Outgoing),
            next_id: 0,
            total_supply: 0,
        }
    }

    // ---------- wrap ----------

    /// Called by the underlying USDC contract on `ft_transfer_call`. Credits final rUSDC to the sender.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.underlying, "only the underlying token can wrap");
        let _ = msg;
        self.credit(&sender_id, amount.0);
        self.total_supply += amount.0;
        emit("wrap", json!({ "account_id": sender_id, "amount": amount }));
        PromiseOrValue::Value(U128(0))
    }

    // ---------- move ----------

    /// Send rUSDC. The receiver sees it as pending until the undo window passes.
    #[payable]
    pub fn transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) -> U64 {
        assert_one_yocto();
        let sender = env::predecessor_account_id();
        require!(receiver_id != sender, "cannot transfer to yourself");
        require!(amount.0 > 0, "amount must be positive");
        if let Some(m) = &memo {
            require!(m.len() <= MAX_TEXT, "memo too long");
        }
        self.settle_internal(&sender);
        self.debit(&sender, amount.0);
        U64(self.new_transfer(Kind::Transfer, sender, receiver_id, amount.0, memo))
    }

    /// Start an unwrap. The USDC can be withdrawn after the undo window (see `withdraw`).
    #[payable]
    pub fn unwrap(&mut self, amount: U128) -> U64 {
        assert_one_yocto();
        let account = env::predecessor_account_id();
        require!(amount.0 > 0, "amount must be positive");
        self.settle_internal(&account);
        self.debit(&account, amount.0);
        U64(self.new_transfer(Kind::Exit, account.clone(), account, amount.0, None))
    }

    /// Finish an unwrap whose window has passed. Anyone may call; USDC goes to the exit owner.
    pub fn withdraw(&mut self, transfer_id: U64) -> Promise {
        let now = env::block_timestamp();
        let t = self.transfers.get_mut(&transfer_id.0).unwrap_or_else(|| env::panic_str("unknown transfer"));
        require!(t.kind == Kind::Exit, "not an unwrap");
        require!(t.status == Status::Pending, "unwrap is not pending (disputed, reversed or already withdrawn)");
        require!(now >= t.unlock_at.0, "unwrap is still inside the undo window");
        t.status = Status::Settled;
        let to = t.to.clone();
        let amount = t.amount.0;
        self.total_supply -= amount;
        ext_ft::ext(self.underlying.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(to, U128(amount), Some(format!("undo unwrap #{}", transfer_id.0)))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_ON_WITHDRAW).on_withdraw(transfer_id))
    }

    #[private]
    pub fn on_withdraw(&mut self, transfer_id: U64) -> bool {
        if env::promise_result_checked(0, 64).is_ok() {
            if let Some(t) = self.transfers.get(&transfer_id.0) {
                emit("withdraw", json!({ "id": transfer_id, "account_id": t.to, "amount": t.amount }));
            }
            return true;
        }
        // USDC transfer failed: put the exit back so it can be retried.
        let t = self.transfers.get_mut(&transfer_id.0).unwrap_or_else(|| env::panic_str("unknown transfer"));
        t.status = Status::Pending;
        self.total_supply += t.amount.0;
        false
    }

    /// Move every incoming transfer whose window has passed into the final balance.
    pub fn settle(&mut self, account_id: AccountId) -> U128 {
        U128(self.settle_internal(&account_id))
    }

    // ---------- dispute ----------

    /// Report a pending transfer or unwrap as theft. Attach exactly `report_bond`.
    #[payable]
    pub fn report(&mut self, transfer_id: U64, reason: String) {
        require!(reason.len() <= MAX_TEXT, "reason too long");
        let bond = self.report_bond;
        require!(env::attached_deposit().as_yoctonear() == bond, "attach exactly the report bond");
        let now = env::block_timestamp();
        let reporter = env::predecessor_account_id();
        let t = self.transfers.get_mut(&transfer_id.0).unwrap_or_else(|| env::panic_str("unknown transfer"));
        require!(t.status == Status::Pending, "only pending transfers can be reported");
        require!(now < t.unlock_at.0, "the undo window has closed");
        t.status = Status::Disputed;
        t.reporter = Some(reporter.clone());
        t.report_reason = Some(reason.clone());
        t.reported_at = Some(U64(now));
        t.bond = U128(bond);
        emit("report", json!({ "id": transfer_id, "reporter": reporter, "reason": reason }));
    }

    /// Attach an AI verdict (hashes + TEE signature) to a disputed transfer. Judge only.
    #[allow(clippy::too_many_arguments)]
    pub fn post_verdict(
        &mut self,
        transfer_id: U64,
        stolen: bool,
        confidence: u8,
        model: String,
        request_hash: String,
        response_hash: String,
        signature: String,
    ) {
        require!(env::predecessor_account_id() == self.judge, "only the judge can post verdicts");
        require!(confidence <= 100, "confidence is 0-100");
        for s in [&model, &request_hash, &response_hash, &signature] {
            require!(s.len() <= MAX_TEXT, "field too long");
        }
        let t = self.transfers.get_mut(&transfer_id.0).unwrap_or_else(|| env::panic_str("unknown transfer"));
        require!(t.status == Status::Disputed, "transfer is not disputed");
        t.verdict = Some(Verdict {
            stolen,
            confidence,
            model,
            request_hash,
            response_hash,
            signature,
            posted_at: U64(env::block_timestamp()),
        });
        emit("verdict", json!({ "id": transfer_id, "stolen": stolen, "confidence": confidence }));
    }

    /// Council decision. `reverse = true` sends the funds to `refund_to` (default: the sender)
    /// and returns the bond to the reporter. `reverse = false` releases the funds to the receiver
    /// and gives the bond to the receiver as compensation.
    pub fn resolve(&mut self, transfer_id: U64, reverse: bool, refund_to: Option<AccountId>) {
        require!(env::predecessor_account_id() == self.council, "only the council can resolve");
        let t = self.transfers.get_mut(&transfer_id.0).unwrap_or_else(|| env::panic_str("unknown transfer"));
        require!(t.status == Status::Disputed, "transfer is not disputed");
        let (kind, from, to, amount, bond) = (t.kind, t.from.clone(), t.to.clone(), t.amount.0, t.bond.0);
        let reporter = t.reporter.clone().unwrap_or_else(|| env::panic_str("missing reporter"));
        if reverse {
            let dest = refund_to.unwrap_or_else(|| from.clone());
            t.status = Status::Reversed;
            t.refund_to = Some(dest.clone());
            self.credit(&dest, amount);
            if bond > 0 {
                Promise::new(reporter).transfer(NearToken::from_yoctonear(bond)).detach();
            }
            emit("reverse", json!({ "id": transfer_id, "refund_to": dest, "amount": U128(amount) }));
        } else {
            match kind {
                Kind::Transfer => {
                    t.status = Status::Settled;
                    self.credit(&to, amount);
                }
                // An unwrap goes back to pending so its owner can withdraw it.
                Kind::Exit => t.status = Status::Pending,
            }
            if bond > 0 {
                Promise::new(to.clone()).transfer(NearToken::from_yoctonear(bond)).detach();
            }
            emit("release", json!({ "id": transfer_id, "to": to, "amount": U128(amount) }));
        }
    }

    pub fn set_judge(&mut self, judge: AccountId) {
        require!(env::predecessor_account_id() == self.owner, "owner only");
        self.judge = judge;
    }

    // ---------- views ----------

    pub fn get_config(&self) -> Config {
        Config {
            owner: self.owner.clone(),
            underlying: self.underlying.clone(),
            council: self.council.clone(),
            judge: self.judge.clone(),
            window_sec: (self.window_ns / 1_000_000_000) as u32,
            dispute_timeout_sec: (self.dispute_timeout_ns / 1_000_000_000) as u32,
            report_bond: U128(self.report_bond),
            total_supply: U128(self.total_supply),
            next_id: U64(self.next_id),
        }
    }

    pub fn balance_of(&self, account_id: AccountId) -> BalanceView {
        let now = env::block_timestamp();
        let mut available = self.balances.get(&account_id).copied().unwrap_or(0);
        let (mut pending_in, mut disputed_in, mut pending_exit) = (0u128, 0u128, 0u128);
        for id in self.incoming.get(&account_id).map(|v| v.as_slice()).unwrap_or(&[]) {
            if let Some(t) = self.transfers.get(id) {
                match t.status {
                    Status::Pending if now >= t.unlock_at.0 => available += t.amount.0,
                    Status::Pending => pending_in += t.amount.0,
                    Status::Disputed if self.timed_out(t, now) => available += t.amount.0,
                    Status::Disputed => disputed_in += t.amount.0,
                    _ => {}
                }
            }
        }
        for id in self.outgoing.get(&account_id).map(|v| v.as_slice()).unwrap_or(&[]) {
            if let Some(t) = self.transfers.get(id) {
                if t.kind == Kind::Exit && matches!(t.status, Status::Pending | Status::Disputed) {
                    pending_exit += t.amount.0;
                }
            }
        }
        BalanceView {
            available: U128(available),
            pending_in: U128(pending_in),
            disputed_in: U128(disputed_in),
            pending_exit: U128(pending_exit),
        }
    }

    pub fn get_transfer(&self, transfer_id: U64) -> Option<Transfer> {
        self.transfers.get(&transfer_id.0).cloned()
    }

    /// Incoming transfers not yet settled (pending or disputed).
    pub fn get_incoming(&self, account_id: AccountId) -> Vec<Transfer> {
        self.list(self.incoming.get(&account_id))
    }

    /// Latest outgoing transfers and unwraps (newest first).
    pub fn get_outgoing(&self, account_id: AccountId, limit: Option<u32>) -> Vec<Transfer> {
        let limit = limit.unwrap_or(20).min(100) as usize;
        let ids: Vec<u64> = self
            .outgoing
            .get(&account_id)
            .map(|v| v.iter().rev().take(limit).copied().collect())
            .unwrap_or_default();
        ids.iter().filter_map(|id| self.transfers.get(id).cloned()).collect()
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.balance_of(account_id).available
    }

    pub fn ft_total_supply(&self) -> U128 {
        U128(self.total_supply)
    }

    pub fn ft_metadata(&self) -> Value {
        json!({ "spec": "ft-1.0.0", "name": "Undo USD (testnet)", "symbol": "rUSDC", "decimals": 6 })
    }

    // ---------- internal ----------

    fn timed_out(&self, t: &Transfer, now: u64) -> bool {
        t.reported_at.map(|r| now >= r.0 + self.dispute_timeout_ns).unwrap_or(false)
    }

    fn list(&self, ids: Option<&Vec<u64>>) -> Vec<Transfer> {
        ids.map(|v| v.iter().filter_map(|id| self.transfers.get(id).cloned()).collect())
            .unwrap_or_default()
    }

    fn credit(&mut self, account: &AccountId, amount: u128) {
        let b = self.balances.get(account).copied().unwrap_or(0);
        self.balances.insert(account.clone(), b + amount);
    }

    fn debit(&mut self, account: &AccountId, amount: u128) {
        let b = self.balances.get(account).copied().unwrap_or(0);
        require!(b >= amount, "not enough available rUSDC (incoming funds unlock after the undo window)");
        self.balances.insert(account.clone(), b - amount);
    }

    fn new_transfer(&mut self, kind: Kind, from: AccountId, to: AccountId, amount: u128, memo: Option<String>) -> u64 {
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
            unlock_at: U64(now + self.window_ns),
            status: Status::Pending,
            reporter: None,
            report_reason: None,
            reported_at: None,
            bond: U128(0),
            verdict: None,
            refund_to: None,
        };
        emit(
            if kind == Kind::Exit { "unwrap" } else { "transfer" },
            json!({ "id": U64(id), "from": from, "to": to, "amount": U128(amount), "unlock_at": t.unlock_at }),
        );
        self.transfers.insert(id, t);
        if kind == Kind::Transfer {
            self.incoming.entry(to).or_default().push(id);
        }
        self.outgoing.entry(from).or_default().push(id);
        id
    }

    /// Settle matured incoming transfers for `account`. Returns the amount credited.
    fn settle_internal(&mut self, account: &AccountId) -> u128 {
        let now = env::block_timestamp();
        let timeout = self.dispute_timeout_ns;
        let ids = match self.incoming.get(account) {
            Some(v) => v.clone(),
            None => return 0,
        };
        let mut keep = Vec::new();
        let mut credited = 0u128;
        let mut bonds: Vec<(AccountId, u128)> = Vec::new();
        for id in ids {
            let Some(t) = self.transfers.get_mut(&id) else { continue };
            match t.status {
                Status::Pending if now >= t.unlock_at.0 => {
                    t.status = Status::Settled;
                    credited += t.amount.0;
                }
                Status::Disputed if t.reported_at.map(|r| now >= r.0 + timeout).unwrap_or(false) => {
                    // The council stayed silent: release to the receiver, bond goes to the receiver.
                    t.status = Status::Settled;
                    credited += t.amount.0;
                    if t.bond.0 > 0 {
                        bonds.push((t.to.clone(), t.bond.0));
                    }
                }
                Status::Pending | Status::Disputed => keep.push(id),
                _ => {}
            }
        }
        self.incoming.insert(account.clone(), keep);
        if credited > 0 {
            self.credit(account, credited);
            emit("settle", json!({ "account_id": account, "amount": U128(credited) }));
        }
        for (to, bond) in bonds {
            Promise::new(to).transfer(NearToken::from_yoctonear(bond)).detach();
        }
        credited
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    const SEC: u64 = 1_000_000_000;

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn ctx(predecessor: &str, ts_sec: u64, deposit: u128) {
        let mut b = VMContextBuilder::new();
        b.current_account_id(acc("undo.testnet"))
            .predecessor_account_id(acc(predecessor))
            .block_timestamp(ts_sec * SEC)
            .attached_deposit(NearToken::from_yoctonear(deposit));
        testing_env!(b.build());
    }

    fn setup() -> Contract {
        ctx("owner.testnet", 1_000, 0);
        let mut c = Contract::new(acc("usdc.testnet"), acc("dao.testnet"), acc("judge.testnet"), 120, 3_600, U128(100));
        ctx("usdc.testnet", 1_000, 0);
        c.ft_on_transfer(acc("victim.testnet"), U128(50_000_000), String::new());
        c
    }

    #[test]
    fn transfer_is_pending_then_final() {
        let mut c = setup();
        ctx("victim.testnet", 1_000, 1);
        c.transfer(acc("bob.testnet"), U128(10_000_000), None);
        ctx("bob.testnet", 1_060, 0);
        assert_eq!(c.balance_of(acc("bob.testnet")).available.0, 0);
        assert_eq!(c.balance_of(acc("bob.testnet")).pending_in.0, 10_000_000);
        ctx("bob.testnet", 1_121, 0);
        assert_eq!(c.balance_of(acc("bob.testnet")).available.0, 10_000_000);
        assert_eq!(c.balance_of(acc("victim.testnet")).available.0, 40_000_000);
    }

    #[test]
    #[should_panic(expected = "not enough available rUSDC")]
    fn receiver_cannot_spend_pending() {
        let mut c = setup();
        ctx("victim.testnet", 1_000, 1);
        c.transfer(acc("thief.testnet"), U128(50_000_000), None);
        ctx("thief.testnet", 1_010, 1);
        c.unwrap(U128(1));
    }

    #[test]
    fn report_and_council_reverse_to_safe_account() {
        let mut c = setup();
        ctx("victim.testnet", 1_000, 1);
        let id = c.transfer(acc("thief.testnet"), U128(50_000_000), None);
        ctx("watcher.testnet", 1_030, 100);
        c.report(id, "key stolen".into());
        ctx("judge.testnet", 1_040, 0);
        c.post_verdict(id, true, 92, "model".into(), "rq".into(), "rs".into(), "sig".into());
        ctx("dao.testnet", 1_200, 0);
        c.resolve(id, true, Some(acc("victim-safe.testnet")));
        assert_eq!(c.get_transfer(id).unwrap().status, Status::Reversed);
        assert_eq!(c.balance_of(acc("victim-safe.testnet")).available.0, 50_000_000);
        ctx("thief.testnet", 2_000, 0);
        assert_eq!(c.balance_of(acc("thief.testnet")).available.0, 0);
    }

    #[test]
    #[should_panic(expected = "only the council can resolve")]
    fn only_council_resolves() {
        let mut c = setup();
        ctx("victim.testnet", 1_000, 1);
        let id = c.transfer(acc("thief.testnet"), U128(1), None);
        ctx("watcher.testnet", 1_001, 100);
        c.report(id, "x".into());
        ctx("thief.testnet", 1_002, 0);
        c.resolve(id, false, None);
    }

    #[test]
    #[should_panic(expected = "the undo window has closed")]
    fn cannot_report_after_window() {
        let mut c = setup();
        ctx("victim.testnet", 1_000, 1);
        let id = c.transfer(acc("bob.testnet"), U128(1), None);
        ctx("watcher.testnet", 1_200, 100);
        c.report(id, "late".into());
    }

    #[test]
    fn silent_council_releases_after_timeout() {
        let mut c = setup();
        ctx("victim.testnet", 1_000, 1);
        let id = c.transfer(acc("bob.testnet"), U128(5), None);
        ctx("watcher.testnet", 1_010, 100);
        c.report(id, "maybe".into());
        ctx("bob.testnet", 1_010 + 3_599, 0);
        assert_eq!(c.balance_of(acc("bob.testnet")).disputed_in.0, 5);
        ctx("bob.testnet", 1_010 + 3_600, 0);
        assert_eq!(c.settle(acc("bob.testnet")).0, 5);
        assert_eq!(c.balance_of(acc("bob.testnet")).available.0, 5);
    }

    #[test]
    #[should_panic(expected = "unwrap is still inside the undo window")]
    fn unwrap_waits_for_window() {
        let mut c = setup();
        ctx("victim.testnet", 1_000, 1);
        let id = c.unwrap(U128(1_000_000));
        ctx("victim.testnet", 1_050, 0);
        c.withdraw(id);
    }
}
