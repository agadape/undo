//! Property tests: long random action sequences (senders, thieves, receivers, recovery accounts,
//! the council, time jumps). Only actions whose preconditions hold are sent, so any panic is a bug.
//! After EVERY step:
//! - J6 conservation: total_supply == USDC in − USDC out == Σ balances + Σ money still in flight.
//! - J1 destinations: final money only ever reached the receiver, the sender, or an account that was
//!   (at some point) the sender's recovery account.
//! - J2 finality: a transfer that settled, was reversed, or matured untouched never changes again.
use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;
use std::collections::{BTreeMap, HashMap, HashSet};

const SEC: u64 = 1_000_000_000;
const BOND: u128 = 100;
/// Default 4 seeds keeps `cargo test` quick. Full run (≈12 min debug):
/// `UNDO_FUZZ_SEEDS=40 cargo test -p undo_token property` (faster with `--release`).
fn seeds() -> u64 {
    std::env::var("UNDO_FUZZ_SEEDS").ok().and_then(|s| s.parse().ok()).unwrap_or(4)
}
const STEPS: usize = 400;
const PEOPLE: [&str; 5] = ["u0.testnet", "u1.testnet", "u2.testnet", "u3.testnet", "u4.testnet"];
const RECOVERY: [&str; 3] = ["r0.testnet", "r1.testnet", "r2.testnet"];
const SHOP: &str = "shop.testnet";
const COUNCIL: &str = "dao.testnet";

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n.max(1)
    }
    fn chance(&mut self, pct: u64) -> bool {
        self.below(100) < pct
    }
    fn pick<T: Clone>(&mut self, v: &[T]) -> Option<T> {
        if v.is_empty() { None } else { Some(v[self.below(v.len() as u64) as usize].clone()) }
    }
}

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn ctx(predecessor: &AccountId, t: u64, deposit: u128, seed: u8) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("undo.testnet"))
        .predecessor_account_id(predecessor.clone())
        .block_timestamp(t * SEC)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .random_seed([seed; 32]);
    testing_env!(b.build());
}

struct World {
    c: Contract,
    now: u64,
    wrapped: u128,
    withdrawn: u128,
    ever_recovery: HashMap<AccountId, HashSet<AccountId>>,
    finals: HashMap<u64, (Status, Option<AccountId>)>,
    matured: HashSet<u64>,
    seed: u8,
}

impl World {
    fn all_accounts() -> Vec<AccountId> {
        PEOPLE.iter().chain(RECOVERY.iter()).chain([SHOP].iter()).map(|s| acc(s)).collect()
    }
    fn senders() -> Vec<AccountId> {
        PEOPLE.iter().chain(RECOVERY.iter()).map(|s| acc(s)).collect()
    }
    fn at(&self, who: &AccountId, deposit: u128) {
        ctx(who, self.now, deposit, self.seed);
    }
    fn transfers(&self) -> Vec<Transfer> {
        (0..self.c.next_id).filter_map(|id| self.c.transfers.get(&id).cloned()).collect()
    }
    fn locked(&self, a: &AccountId) -> bool {
        self.c.state(a).locked
    }
    fn available(&self, a: &AccountId) -> u128 {
        self.at(a, 0);
        self.c.balance_of(a.clone()).available.0
    }

    /// One random action whose preconditions hold. Returns its name (or None if skipped).
    fn step(&mut self, rng: &mut Rng) -> Option<&'static str> {
        let now = self.now * SEC; // contract timestamps are in nanoseconds
        self.at(&acc("viewer.testnet"), 0); // read state at the current time
        let ts = self.transfers();
        match rng.below(21) {
            0 | 1 => {
                let who = rng.pick(&Self::senders())?;
                let amount = 1 + rng.below(1_000) as u128;
                self.at(&acc("usdc.testnet"), 0);
                let _ = self.c.ft_on_transfer(who, U128(amount), String::new());
                self.wrapped += amount;
                Some("wrap")
            }
            2 | 3 | 4 => {
                let from = rng.pick(&Self::senders())?;
                let avail = self.available(&from);
                if self.locked(&from) || avail == 0 { return None; }
                let to = rng.pick(&Self::all_accounts().into_iter().filter(|a| *a != from).collect::<Vec<_>>())?;
                let amount = 1 + rng.below(avail as u64) as u128;
                self.at(&from, 1);
                let contact = self.c.is_active_contact(&from, &to);
                self.c.transfer(to, U128(amount), None);
                Some(if contact { "transfer_to_contact" } else { "transfer" })
            }
            5 => {
                let from = rng.pick(&Self::senders())?;
                let avail = self.available(&from);
                if self.locked(&from) || avail == 0 { return None; }
                let amount = 1 + rng.below(avail as u64) as u128;
                self.at(&from, 1);
                if rng.chance(50) { self.c.send_usdc(acc(SHOP), U128(amount), None); Some("send_usdc") } else { self.c.unwrap(U128(amount)); Some("unwrap") }
            }
            6 => {
                let who = rng.pick(&PEOPLE.iter().map(|s| acc(s)).collect::<Vec<_>>())?;
                if self.locked(&who) { return None; }
                let rec = rng.pick(&RECOVERY.iter().map(|s| acc(s)).collect::<Vec<_>>())?;
                self.ever_recovery.entry(who.clone()).or_default().insert(rec.clone());
                self.at(&who, 0);
                self.c.set_recovery(rec);
                Some("set_recovery")
            }
            7 => {
                let who = rng.pick(&PEOPLE.iter().map(|s| acc(s)).collect::<Vec<_>>())?;
                let st = self.c.state(&who);
                st.pending_recovery.as_ref()?;
                let caller = st.recovery.clone().unwrap_or_else(|| who.clone());
                self.at(&caller, 0);
                self.c.cancel_recovery_change(who);
                Some("cancel_recovery_change")
            }
            8 => {
                let who = rng.pick(&PEOPLE.iter().map(|s| acc(s)).collect::<Vec<_>>())?;
                let rec = self.c.current_recovery(&who)?;
                self.at(&rec, 0);
                self.c.panic(who);
                Some("panic")
            }
            9 => {
                let who = rng.pick(&PEOPLE.iter().map(|s| acc(s)).collect::<Vec<_>>())?;
                if !self.locked(&who) { return None; }
                let rec = self.c.current_recovery(&who)?;
                self.at(&rec, 0);
                self.c.unlock(who);
                Some("unlock")
            }
            10 => {
                let t = rng.pick(&ts.iter().filter(|t| matches!(t.kind, Kind::Transfer | Kind::Exit) && t.status == Status::Pending && now < t.unlock_at.0).cloned().collect::<Vec<_>>())?;
                let own_unwrap = t.kind == Kind::Exit && t.to == t.from;
                let mut callers = Vec::new();
                if !own_unwrap && !self.locked(&t.from) { callers.push(t.from.clone()); }
                if let Some(r) = self.c.current_recovery(&t.from) { callers.push(r); }
                let caller = rng.pick(&callers)?;
                self.at(&caller, BOND);
                self.c.report(t.id, "fuzz".into());
                Some("report")
            }
            11 => {
                let t = rng.pick(&ts.iter().filter(|t| t.status == Status::Frozen && now < t.frozen_until.unwrap().0).cloned().collect::<Vec<_>>())?;
                let callers = if t.kind == Kind::Sweep { vec![t.from.clone()] } else { vec![t.to.clone(), t.from.clone()] };
                let caller = rng.pick(&callers)?;
                self.at(&caller, BOND);
                self.c.contest(t.id, "fuzz".into());
                Some("contest")
            }
            12 => {
                let t = rng.pick(&ts.iter().filter(|t| t.status == Status::Frozen && now >= t.frozen_until.unwrap().0).cloned().collect::<Vec<_>>())?;
                self.at(&acc("anyone.testnet"), 0);
                self.c.finalize(t.id);
                Some("finalize")
            }
            13 => {
                let t = rng.pick(&ts.iter().filter(|t| t.status == Status::Disputed).cloned().collect::<Vec<_>>())?;
                self.at(&acc(COUNCIL), 0);
                self.c.resolve(t.id, rng.chance(50), "fuzz".into());
                Some("resolve")
            }
            14 => {
                let timeout = self.c.dispute_timeout_ns;
                let t = rng.pick(&ts.iter().filter(|t| t.status == Status::Disputed && now >= t.dispute.as_ref().unwrap().opened_at.0 + timeout).cloned().collect::<Vec<_>>())?;
                self.at(&acc("anyone.testnet"), 0);
                self.c.release_expired(t.id);
                Some("release_expired")
            }
            15 => {
                let t = rng.pick(&ts.iter().filter(|t| matches!(t.kind, Kind::Transfer | Kind::Exit) && t.status == Status::Pending && now < t.unlock_at.0).cloned().collect::<Vec<_>>())?;
                let rec = self.c.current_recovery(&t.from)?;
                self.at(&rec, 0);
                self.c.release(t.id);
                Some("release")
            }
            16 => {
                let t = rng.pick(&ts.iter().filter(|t| t.kind == Kind::Exit && t.status == Status::Pending && now >= t.unlock_at.0).cloned().collect::<Vec<_>>())?;
                self.at(&acc("anyone.testnet"), 0);
                let _ = self.c.withdraw(t.id);
                self.withdrawn += t.amount.0;
                Some("withdraw")
            }
            18 => {
                let who = rng.pick(&Self::senders())?;
                if self.locked(&who) { return None; }
                let list = self.c.contacts.get(&who).cloned().unwrap_or_default();
                if list.len() >= MAX_CONTACTS { return None; }
                let to = rng.pick(&Self::all_accounts().into_iter().filter(|a| *a != who && !list.iter().any(|(c, _)| c == a)).collect::<Vec<_>>())?;
                self.at(&who, 1);
                self.c.add_contact(to);
                Some("add_contact")
            }
            19 => {
                let who = rng.pick(&Self::senders())?;
                let list = self.c.contacts.get(&who).cloned().unwrap_or_default();
                let (c, _) = rng.pick(&list)?;
                self.at(&who, 0);
                self.c.remove_contact(c);
                Some("remove_contact")
            }
            20 => {
                let who = rng.pick(&PEOPLE.iter().map(|s| acc(s)).collect::<Vec<_>>())?;
                let rec = self.c.current_recovery(&who)?;
                let list = self.c.contacts.get(&who).cloned().unwrap_or_default();
                let (c, _) = rng.pick(&list)?;
                self.at(&rec, 0);
                self.c.cancel_contact(who, c);
                Some("cancel_contact")
            }
            _ => {
                let t = rng.pick(&ts.iter().filter(|t| t.status == Status::Disputed && now < t.dispute.as_ref().unwrap().evidence_deadline.0).cloned().collect::<Vec<_>>())?;
                let d = t.dispute.clone().unwrap();
                let mut callers: Vec<AccountId> = Vec::new();
                for who in Self::all_accounts() {
                    let s = self.c.is_sender_side(&t, &who);
                    let r = self.c.is_receiver_side(&t, &who);
                    if s != r && ((s && d.evidence_sender.is_none()) || (r && d.evidence_receiver.is_none())) {
                        callers.push(who);
                    }
                }
                let caller = rng.pick(&callers)?;
                self.at(&caller, 0);
                self.c.commit_evidence(t.id, format!("{:064x}", rng.next()));
                Some("commit_evidence")
            }
        }
    }

    fn check(&mut self, where_: &str) {
        self.at(&acc("viewer.testnet"), 0);
        let ts = self.transfers();
        // J6 conservation
        let in_flight: u128 = ts.iter().filter(|t| matches!(t.status, Status::Pending | Status::Frozen | Status::Disputed)).map(|t| t.amount.0).sum();
        let balances: u128 = Self::all_accounts().iter().map(|a| self.c.balances.get(a).copied().unwrap_or(0)).sum();
        assert_eq!(self.c.total_supply, self.wrapped - self.withdrawn, "J6: supply != USDC in - out ({where_})");
        assert_eq!(self.c.total_supply, balances + in_flight, "J6: supply != balances + in flight ({where_})");
        for t in &ts {
            // J1 destinations
            if let Some(f) = &t.final_to {
                let ok = *f == t.to || *f == t.from || self.ever_recovery.get(&t.from).map(|s| s.contains(f)).unwrap_or(false);
                assert!(ok, "J1: transfer #{} ended at {} ({where_})", t.id.0, f);
            }
            // J2 finality
            if let Some(prev) = self.finals.get(&t.id.0) {
                assert_eq!(*prev, (t.status, t.final_to.clone()), "J2: final transfer #{} changed ({where_})", t.id.0);
            } else if matches!(t.status, Status::Settled | Status::Reversed) && !(t.kind == Kind::Exit && t.status == Status::Settled && t.final_to.is_none()) {
                self.finals.insert(t.id.0, (t.status, t.final_to.clone()));
            }
            if self.matured.contains(&t.id.0) {
                assert!(
                    t.status == Status::Pending || (t.status == Status::Settled && t.final_to.as_ref() == Some(&t.to)),
                    "J2: matured transfer #{} was touched: {:?} ({where_})",
                    t.id.0,
                    t.status
                );
            } else if t.status == Status::Pending && self.now * SEC >= t.unlock_at.0 {
                self.matured.insert(t.id.0);
            }
        }
    }
}

/// One seed in its own thread: the mocked blockchain (and its storage) is per thread, so every
/// seed starts from an empty chain.
fn run_seed(seed: u64) -> BTreeMap<&'static str, u32> {
    let mut totals = BTreeMap::new();
    let s = seed as u8;
    ctx(&acc("deployer.testnet"), 1_000, 0, s);
    // window 120 s, contest 60 s, evidence 30 s, timeout 600 s, recovery delay 90 s
    let c = Contract::new(acc("usdc.testnet"), acc(COUNCIL), 120, 60, 30, 600, 90, U128(BOND), U128(0), Some(120));
    let mut w = World { c, now: 1_000, wrapped: 0, withdrawn: 0, ever_recovery: HashMap::new(), finals: HashMap::new(), matured: HashSet::new(), seed: s };
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15 ^ seed.wrapping_mul(0x2545_F491_4F6C_DD1D));
    for i in 0..STEPS {
        if rng.chance(30) {
            w.now += if rng.chance(8) { 700 } else { rng.below(90) };
        }
        if let Some(name) = w.step(&mut rng) {
            *totals.entry(name).or_default() += 1;
        }
        w.check(&format!("seed {seed}, step {i}"));
    }
    totals
}

#[test]
fn property_j1_j2_j6_hold_under_random_actions() {
    let mut totals: BTreeMap<&'static str, u32> = BTreeMap::new();
    let n = seeds();
    for seed in 1..=n {
        let per_seed = std::thread::spawn(move || run_seed(seed)).join().unwrap_or_else(|_| panic!("seed {seed} failed (see message above)"));
        for (k, v) in per_seed {
            *totals.entry(k).or_default() += v;
        }
    }
    println!("actions executed over {n} seeds x {STEPS} steps: {totals:?}");
    for must in ["transfer", "report", "contest", "panic", "finalize", "resolve", "release_expired", "release", "withdraw", "set_recovery", "commit_evidence", "add_contact", "transfer_to_contact"] {
        assert!(totals.get(must).copied().unwrap_or(0) >= 1 + n as u32 / 4, "fuzzer barely exercised `{must}`: {totals:?}");
    }
}
