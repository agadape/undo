//! Unit tests, named after the promise (J1–J7) or threat (A1–A9) they prove (PLAN_UNDO.md §1, §4).
use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const SEC: u64 = 1_000_000_000;
const T0: u64 = 1_000;
const BOND: u128 = 100;
// setup(): window 120 s, contest 60 s, evidence 30 s, dispute timeout 3600 s, recovery delay 300 s.

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn ctx(predecessor: &str, t: u64, deposit: u128) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("undo.testnet"))
        .predecessor_account_id(acc(predecessor))
        .block_timestamp(t * SEC)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .random_seed([7u8; 32]);
    testing_env!(b.build());
}

fn setup() -> Contract {
    ctx("deployer.testnet", T0, 0);
    Contract::new(acc("usdc.testnet"), acc("dao.testnet"), 120, 60, 30, 3_600, 300, U128(BOND), U128(0))
}

fn wrap(c: &mut Contract, who: &str, amount: u128, t: u64) {
    ctx("usdc.testnet", t, 0);
    let _ = c.ft_on_transfer(acc(who), U128(amount), String::new());
}

fn avail(c: &Contract, who: &str, t: u64) -> u128 {
    ctx("viewer.testnet", t, 0);
    c.balance_of(acc(who)).available.0
}

fn status(c: &Contract, id: U64) -> Status {
    c.get_transfer(id).unwrap().status
}

/// alice has recovery alice-hp (set while empty), then receives 1000 rUSDC.
fn alice_with_recovery(c: &mut Contract) {
    ctx("alice.testnet", T0, 0);
    c.set_recovery(acc("alice-hp.testnet"));
    wrap(c, "alice.testnet", 1_000, T0);
}

fn send(c: &mut Contract, from: &str, to: &str, amount: u128, t: u64) -> U64 {
    ctx(from, t, 1);
    c.transfer(acc(to), U128(amount), None)
}

// ---------- basics ----------

#[test]
fn transfer_is_pending_then_final() {
    let mut c = setup();
    wrap(&mut c, "alice.testnet", 50, T0);
    send(&mut c, "alice.testnet", "bob.testnet", 10, T0);
    ctx("v.testnet", T0 + 60, 0);
    assert_eq!(c.balance_of(acc("bob.testnet")).pending_in.0, 10);
    assert_eq!(avail(&c, "bob.testnet", T0 + 60), 0);
    assert_eq!(avail(&c, "bob.testnet", T0 + 121), 10);
    assert_eq!(avail(&c, "alice.testnet", T0 + 121), 40);
}

#[test]
#[should_panic(expected = "not enough available rUSDC")]
fn receiver_cannot_spend_pending() {
    let mut c = setup();
    wrap(&mut c, "alice.testnet", 50, T0);
    send(&mut c, "alice.testnet", "thief.testnet", 50, T0);
    ctx("thief.testnet", T0 + 10, 1);
    c.unwrap(U128(1));
}

#[test]
#[should_panic(expected = "storage fee")]
fn storage_fee_is_required() {
    ctx("deployer.testnet", T0, 0);
    let mut c = Contract::new(acc("usdc.testnet"), acc("dao.testnet"), 120, 60, 30, 3_600, 300, U128(BOND), U128(5));
    wrap(&mut c, "alice.testnet", 50, T0);
    send(&mut c, "alice.testnet", "bob.testnet", 10, T0); // 1 yocto instead of 5
}

#[test]
fn send_usdc_reaches_a_plain_usdc_receiver_after_the_window() {
    let mut c = setup();
    wrap(&mut c, "alice.testnet", 100, T0);
    ctx("alice.testnet", T0, 1);
    let id = c.send_usdc(acc("shop.testnet"), U128(30), None);
    let t = c.get_transfer(id).unwrap();
    assert_eq!((t.kind, t.to.clone()), (Kind::Exit, acc("shop.testnet")));
    ctx("anyone.testnet", T0 + 121, 0);
    let _ = c.withdraw(id);
    assert_eq!(status(&c, id), Status::Settled);
    assert_eq!(c.ft_total_supply().0, 70);
}

#[test]
#[should_panic(expected = "exit is still inside the undo window")]
fn send_usdc_waits_for_the_window() {
    let mut c = setup();
    wrap(&mut c, "alice.testnet", 100, T0);
    ctx("alice.testnet", T0, 1);
    let id = c.send_usdc(acc("shop.testnet"), U128(30), None);
    ctx("anyone.testnet", T0 + 60, 0);
    let _ = c.withdraw(id);
}

// ---------- J1: only two destinations ----------

#[test]
fn j1_reversal_goes_to_the_recovery_account() {
    let mut c = setup();
    alice_with_recovery(&mut c);
    let id = send(&mut c, "alice.testnet", "thief.testnet", 900, T0 + 1);
    ctx("alice-hp.testnet", T0 + 5, BOND);
    c.report(id, "kunci dicuri".into());
    ctx("dao.testnet", T0 + 10, 0);
    c.resolve(id, true, "bukti kuat".into());
    let t = c.get_transfer(id).unwrap();
    assert_eq!((t.status, t.final_to), (Status::Reversed, Some(acc("alice-hp.testnet"))));
    assert_eq!(avail(&c, "alice-hp.testnet", T0 + 500), 900);
    assert_eq!(avail(&c, "thief.testnet", T0 + 500), 0);
}

#[test]
fn j1_reversal_without_recovery_returns_to_the_sender() {
    let mut c = setup();
    wrap(&mut c, "bob.testnet", 50, T0);
    let id = send(&mut c, "bob.testnet", "carol.testnet", 50, T0);
    ctx("bob.testnet", T0 + 5, BOND);
    c.report(id, "x".into());
    ctx("dao.testnet", T0 + 10, 0);
    c.resolve(id, true, "x".into());
    assert_eq!(avail(&c, "bob.testnet", T0 + 500), 50);
}

#[test]
fn j1_send_usdc_reversal_returns_rusdc_to_the_recovery_account() {
    let mut c = setup();
    alice_with_recovery(&mut c);
    ctx("alice.testnet", T0 + 1, 1);
    let id = c.send_usdc(acc("fake-shop.testnet"), U128(200), None);
    ctx("alice-hp.testnet", T0 + 5, BOND);
    c.report(id, "toko palsu".into());
    ctx("dao.testnet", T0 + 10, 0);
    c.resolve(id, true, "x".into());
    assert_eq!(avail(&c, "alice-hp.testnet", T0 + 500), 200);
    assert_eq!(c.ft_total_supply().0, 1_000); // nothing left the contract
}

// ---------- J2: only money inside its window ----------

#[test]
#[should_panic(expected = "the undo window has closed")]
fn j2_cannot_report_after_the_window() {
    let mut c = setup();
    wrap(&mut c, "alice.testnet", 50, T0);
    let id = send(&mut c, "alice.testnet", "bob.testnet", 5, T0);
    ctx("alice.testnet", T0 + 200, BOND);
    c.report(id, "late".into());
}

#[test]
fn j2_panic_does_not_touch_final_transfers() {
    let mut c = setup();
    alice_with_recovery(&mut c);
    let paid = send(&mut c, "alice.testnet", "bob.testnet", 100, T0 + 1);
    ctx("alice-hp.testnet", T0 + 500, 0);
    let out = c.panic(acc("alice.testnet"));
    assert_eq!(out["frozen"].as_array().unwrap().len(), 0);
    assert_eq!(status(&c, paid), Status::Pending);
    assert_eq!(avail(&c, "bob.testnet", T0 + 500), 100);
}

// ---------- J3: no reversal without an active act; silence keeps the challenged state ----------

#[test]
fn j3_council_silence_after_a_report_pays_the_receiver() {
    let mut c = setup();
    wrap(&mut c, "alice.testnet", 50, T0);
    let id = send(&mut c, "alice.testnet", "bob.testnet", 50, T0);
    ctx("alice.testnet", T0 + 5, BOND);
    c.report(id, "maybe".into());
    ctx("anyone.testnet", T0 + 5 + 3_600, 0);
    c.release_expired(id);
    let t = c.get_transfer(id).unwrap();
    assert_eq!((t.status, t.final_to.clone()), (Status::Settled, Some(acc("bob.testnet"))));
    assert_eq!(t.dispute.unwrap().decided_by.as_deref(), Some("timeout"));
}

#[test]
fn j3_council_silence_after_a_contested_panic_keeps_the_panic() {
    let mut c = setup();
    alice_with_recovery(&mut c);
    let id = send(&mut c, "alice.testnet", "thief.testnet", 900, T0 + 1);
    ctx("alice-hp.testnet", T0 + 5, 0);
    c.panic(acc("alice.testnet"));
    ctx("thief.testnet", T0 + 10, BOND);
    c.contest(id, "itu bayaran sah".into());
    ctx("anyone.testnet", T0 + 10 + 3_600, 0);
    c.release_expired(id);
    assert_eq!(c.get_transfer(id).unwrap().final_to, Some(acc("alice-hp.testnet")));
    assert_eq!(avail(&c, "thief.testnet", T0 + 9_000), 0);
}

#[test]
#[should_panic(expected = "the council still has time")]
fn j3_timeout_cannot_be_applied_early() {
    let mut c = setup();
    wrap(&mut c, "alice.testnet", 50, T0);
    let id = send(&mut c, "alice.testnet", "bob.testnet", 50, T0);
    ctx("alice.testnet", T0 + 5, BOND);
    c.report(id, "x".into());
    ctx("anyone.testnet", T0 + 100, 0);
    c.release_expired(id);
}

// ---------- J4: only the sender side reports; losers are counted ----------

#[test]
#[should_panic(expected = "only the sender or its recovery account can report")]
fn j4_a_third_party_cannot_report() {
    let mut c = setup();
    wrap(&mut c, "alice.testnet", 50, T0);
    let id = send(&mut c, "alice.testnet", "bob.testnet", 50, T0);
    ctx("carol.testnet", T0 + 5, BOND);
    c.report(id, "griefing".into());
}

#[test]
#[should_panic(expected = "attach exactly the bond")]
fn j4_a_report_needs_the_bond() {
    let mut c = setup();
    wrap(&mut c, "alice.testnet", 50, T0);
    let id = send(&mut c, "alice.testnet", "bob.testnet", 50, T0);
    ctx("alice.testnet", T0 + 5, 1);
    c.report(id, "x".into());
}

#[test]
fn j4_a_losing_reporter_is_counted() {
    let mut c = setup();
    wrap(&mut c, "buyer.testnet", 50, T0);
    let id = send(&mut c, "buyer.testnet", "shop.testnet", 50, T0);
    ctx("buyer.testnet", T0 + 5, BOND);
    c.report(id, "barang tidak datang".into());
    ctx("dao.testnet", T0 + 50, 0);
    c.resolve(id, false, "resi valid, barang diterima".into());
    assert_eq!(c.get_reputation(acc("buyer.testnet")), 1);
    assert_eq!(c.get_reputation(acc("shop.testnet")), 0);
    assert_eq!(avail(&c, "shop.testnet", T0 + 60), 50);
}

// ---------- J5: council-only powers, no owner ----------

#[test]
#[should_panic(expected = "only the council can resolve")]
fn j5_only_the_council_resolves() {
    let mut c = setup();
    wrap(&mut c, "alice.testnet", 50, T0);
    let id = send(&mut c, "alice.testnet", "bob.testnet", 50, T0);
    ctx("alice.testnet", T0 + 5, BOND);
    c.report(id, "x".into());
    ctx("deployer.testnet", T0 + 6, 0);
    c.resolve(id, true, "x".into());
}

#[test]
#[should_panic(expected = "only the council can register the TEE signer")]
fn j5_only_the_council_pins_the_tee_key() {
    let mut c = setup();
    ctx("deployer.testnet", T0, 0);
    c.register_tee_signer("z-ai/glm-5.3-flash".into(), "00".repeat(32));
}

// ---------- J6: supply = USDC held ----------

#[test]
fn j6_supply_tracks_usdc_in_and_out() {
    let mut c = setup();
    wrap(&mut c, "alice.testnet", 100, T0);
    wrap(&mut c, "bob.testnet", 40, T0);
    send(&mut c, "alice.testnet", "bob.testnet", 25, T0);
    ctx("bob.testnet", T0, 1);
    let exit = c.unwrap(U128(30));
    ctx("anyone.testnet", T0 + 121, 0);
    let _ = c.withdraw(exit);
    // 140 USDC in, 30 USDC out.
    assert_eq!(c.ft_total_supply().0, 110);
    let sum = avail(&c, "alice.testnet", T0 + 200) + avail(&c, "bob.testnet", T0 + 200);
    assert_eq!(sum, 110);
}

// ---------- A1–A9: threat model of the panic button ----------

#[test]
fn a1_theft_is_undone_by_panic_without_any_vote() {
    let mut c = setup();
    alice_with_recovery(&mut c);
    let theft = send(&mut c, "alice.testnet", "thief.testnet", 900, T0 + 1); // stolen key
    ctx("alice-hp.testnet", T0 + 30, 0);
    let out = c.panic(acc("alice.testnet"));
    assert_eq!(out["swept"].as_str(), Some("100"));
    let sweep = U64(out["sweep"].as_str().unwrap().parse().unwrap());
    assert_eq!(status(&c, theft), Status::Frozen);
    ctx("anyone.testnet", T0 + 91, 0);
    c.finalize(theft);
    c.finalize(sweep);
    assert_eq!(avail(&c, "alice-hp.testnet", T0 + 92), 1_000);
    assert_eq!(avail(&c, "thief.testnet", T0 + 500), 0);
}

#[test]
#[should_panic(expected = "account is locked")]
fn a1_a_locked_account_cannot_send() {
    let mut c = setup();
    alice_with_recovery(&mut c);
    ctx("alice-hp.testnet", T0 + 1, 0);
    c.panic(acc("alice.testnet"));
    send(&mut c, "alice.testnet", "thief.testnet", 1, T0 + 2);
}

#[test]
#[should_panic(expected = "the contest window is still open")]
fn a1_finalize_waits_for_the_contest_window() {
    let mut c = setup();
    alice_with_recovery(&mut c);
    let theft = send(&mut c, "alice.testnet", "thief.testnet", 900, T0 + 1);
    ctx("alice-hp.testnet", T0 + 30, 0);
    c.panic(acc("alice.testnet"));
    ctx("anyone.testnet", T0 + 60, 0);
    c.finalize(theft);
}

#[test]
fn a2_waiting_does_not_help_the_thief() {
    let mut c = setup();
    alice_with_recovery(&mut c);
    // The thief waits a long time; every new transfer still starts its own window.
    let theft = send(&mut c, "alice.testnet", "thief.testnet", 900, T0 + 50_000);
    ctx("alice-hp.testnet", T0 + 50_050, 0);
    c.panic(acc("alice.testnet"));
    assert_eq!(status(&c, theft), Status::Frozen);
}

#[test]
fn a3_changing_the_recovery_account_is_delayed_and_cancellable() {
    let mut c = setup();
    alice_with_recovery(&mut c);
    ctx("alice.testnet", T0 + 10, 0); // stolen key tries to swap the recovery account
    c.set_recovery(acc("thief-hp.testnet"));
    ctx("v.testnet", T0 + 20, 0);
    assert_eq!(c.get_account(acc("alice.testnet"))["recovery"].as_str(), Some("alice-hp.testnet"));
    ctx("alice-hp.testnet", T0 + 30, 0);
    c.cancel_recovery_change(acc("alice.testnet"));
    ctx("v.testnet", T0 + 1_000, 0);
    assert_eq!(c.get_account(acc("alice.testnet"))["recovery"].as_str(), Some("alice-hp.testnet"));
}

#[test]
fn a3_an_uncancelled_change_takes_effect_only_after_the_delay() {
    let mut c = setup();
    alice_with_recovery(&mut c);
    ctx("alice.testnet", T0 + 10, 0);
    c.set_recovery(acc("alice-new-hp.testnet"));
    ctx("v.testnet", T0 + 309, 0);
    assert_eq!(c.get_account(acc("alice.testnet"))["recovery"].as_str(), Some("alice-hp.testnet"));
    ctx("v.testnet", T0 + 310, 0);
    assert_eq!(c.get_account(acc("alice.testnet"))["recovery"].as_str(), Some("alice-new-hp.testnet"));
}

#[test]
#[should_panic(expected = "account is locked")]
fn a3_a_locked_account_cannot_change_its_recovery() {
    let mut c = setup();
    alice_with_recovery(&mut c);
    ctx("alice-hp.testnet", T0 + 1, 0);
    c.panic(acc("alice.testnet"));
    ctx("alice.testnet", T0 + 2, 0);
    c.set_recovery(acc("thief-hp.testnet"));
}

#[test]
fn a4_instant_recovery_only_for_an_empty_account() {
    let mut c = setup();
    wrap(&mut c, "carol.testnet", 10, T0);
    ctx("carol.testnet", T0 + 1, 0);
    c.set_recovery(acc("thief-hp.testnet"));
    ctx("v.testnet", T0 + 2, 0);
    assert!(c.get_account(acc("carol.testnet"))["recovery"].is_null());
}

#[test]
fn a4_draining_first_does_not_make_the_account_empty() {
    let mut c = setup();
    wrap(&mut c, "carol.testnet", 10, T0);
    send(&mut c, "carol.testnet", "thief.testnet", 10, T0 + 1); // balance 0, but money in flight
    ctx("carol.testnet", T0 + 2, 0);
    c.set_recovery(acc("thief-hp.testnet"));
    ctx("v.testnet", T0 + 3, 0);
    assert!(c.get_account(acc("carol.testnet"))["recovery"].is_null());
}

#[test]
#[should_panic(expected = "only the sender's recovery account can release early")]
fn a5_the_main_key_cannot_skip_the_window() {
    let mut c = setup();
    alice_with_recovery(&mut c);
    let id = send(&mut c, "alice.testnet", "thief.testnet", 900, T0 + 1);
    ctx("alice.testnet", T0 + 2, 0);
    c.release(id);
}

#[test]
fn a5_barang_diterima_from_the_recovery_account_pays_at_once() {
    let mut c = setup();
    alice_with_recovery(&mut c);
    let id = send(&mut c, "alice.testnet", "shop.testnet", 300, T0 + 1);
    ctx("alice-hp.testnet", T0 + 2, 0);
    c.release(id);
    assert_eq!(avail(&c, "shop.testnet", T0 + 3), 300);
}

#[test]
fn a6_a_thief_who_contests_loses_the_bond_and_is_counted() {
    let mut c = setup();
    alice_with_recovery(&mut c);
    let theft = send(&mut c, "alice.testnet", "thief.testnet", 900, T0 + 1);
    ctx("alice-hp.testnet", T0 + 5, 0);
    c.panic(acc("alice.testnet"));
    ctx("thief.testnet", T0 + 10, BOND);
    c.contest(theft, "itu bayaran sah".into());
    ctx("dao.testnet", T0 + 100, 0);
    c.resolve(theft, true, "saldo dikuras ke akun baru".into());
    assert_eq!(avail(&c, "alice-hp.testnet", T0 + 101), 900);
    assert_eq!(c.get_reputation(acc("thief.testnet")), 1);
}

#[test]
fn a7_a_stolen_recovery_account_cannot_just_take_the_balance() {
    let mut c = setup();
    alice_with_recovery(&mut c);
    ctx("alice-hp.testnet", T0 + 5, 0); // the recovery account is the one stolen
    let out = c.panic(acc("alice.testnet"));
    let sweep = U64(out["sweep"].as_str().unwrap().parse().unwrap());
    assert_eq!(avail(&c, "alice-hp.testnet", T0 + 6), 0); // nothing arrives at once
    ctx("alice.testnet", T0 + 10, BOND);
    c.contest(sweep, "bukan saya yang menekan panik".into());
    ctx("dao.testnet", T0 + 100, 0);
    c.resolve(sweep, true, "pemilik membuktikan".into());
    assert_eq!(avail(&c, "alice.testnet", T0 + 101), 1_000);
    assert_eq!(c.get_reputation(acc("alice-hp.testnet")), 1);
}

#[test]
#[should_panic(expected = "only the receiver or the account owner can contest")]
fn a7_the_recovery_account_cannot_contest_its_own_freeze() {
    let mut c = setup();
    alice_with_recovery(&mut c);
    let id = send(&mut c, "alice.testnet", "bob.testnet", 10, T0 + 1);
    ctx("alice-hp.testnet", T0 + 5, 0);
    c.panic(acc("alice.testnet"));
    ctx("alice-hp.testnet", T0 + 6, BOND);
    c.contest(id, "x".into());
}

#[test]
fn a9_the_lock_lives_in_contract_state() {
    let mut c = setup();
    alice_with_recovery(&mut c);
    ctx("alice-hp.testnet", T0 + 5, 0);
    c.panic(acc("alice.testnet"));
    // Deleting and recreating the NEAR account does not touch this map.
    ctx("v.testnet", T0 + 6, 0);
    assert_eq!(c.get_account(acc("alice.testnet"))["locked"].as_bool(), Some(true));
    ctx("alice-hp.testnet", T0 + 7, 0);
    c.unlock(acc("alice.testnet"));
    ctx("v.testnet", T0 + 8, 0);
    assert_eq!(c.get_account(acc("alice.testnet"))["locked"].as_bool(), Some(false));
}

// ---------- J7: court level 2 ----------

const VECTORS: &str = include_str!("../court_vectors.json");

fn vectors() -> Value {
    serde_json::from_str(VECTORS).expect("court_vectors.json")
}
fn s(v: &Value, k: &str) -> String {
    v[k].as_str().unwrap_or_else(|| panic!("missing {k}")).to_string()
}

/// Transfer #0 (150 rUSDC buyer → seller), reported by the buyer, both sides' evidence committed.
fn court_setup() -> (Contract, Value) {
    let v = vectors();
    let mut c = setup();
    ctx("buyer.testnet", T0, 0);
    c.set_recovery(acc("buyer-hp.testnet"));
    wrap(&mut c, "buyer.testnet", 200_000_000, T0);
    let id = send(&mut c, "buyer.testnet", "seller.testnet", 150_000_000, T0);
    assert_eq!(id.0, 0);
    ctx("dao.testnet", T0 + 1, 0);
    c.register_tee_signer(s(&v, "model_id"), s(&v, "signer_pk_hex"));
    c.register_procedure(s(&v, "prompt_sha256"), v["max_tokens"].as_u64().unwrap() as u32);
    ctx("buyer.testnet", T0 + 2, BOND);
    c.report(U64(0), "penjual menghilang".into());
    assert_eq!(c.get_transfer(U64(0)).unwrap().dispute.unwrap().case_nonce, s(&v, "case_nonce"));
    let hashes: Vec<String> = v["evidence_sha256"].as_array().unwrap().iter().map(|h| h.as_str().unwrap().to_string()).collect();
    ctx("buyer.testnet", T0 + 3, 0);
    c.commit_evidence(U64(0), hashes[0].clone());
    ctx("seller.testnet", T0 + 4, 0);
    c.commit_evidence(U64(0), hashes[1].clone());
    (c, v)
}

fn post(c: &mut Contract, v: &Value, bundle: &str, evidence: Vec<String>) -> Recommendation {
    let b = &v["bundles"][bundle];
    ctx("anyone.testnet", T0 + 5, 0);
    c.post_recommendation(
        U64(0),
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
fn j7_an_honest_court_recommendation_is_stored_and_moves_no_money() {
    let (mut c, v) = court_setup();
    let ev = evidence(&v);
    let rec = post(&mut c, &v, "honest", ev);
    assert_eq!(rec.rekomendasi, "kembalikan");
    assert!(rec.curiga_injeksi);
    let t = c.get_transfer(U64(0)).unwrap();
    assert_eq!(t.status, Status::Disputed); // J3: the AI moved nothing
    assert_eq!(t.dispute.unwrap().recommendation, Some(rec));
    ctx("dao.testnet", T0 + 50, 0);
    c.resolve(U64(0), true, "mengikuti rekomendasi".into());
    assert_eq!(avail(&c, "buyer-hp.testnet", T0 + 51), 150_000_000);
}

#[test]
#[should_panic(expected = "every committed evidence must be included")]
fn j7_dropping_the_sellers_evidence_is_rejected() {
    let (mut c, v) = court_setup();
    let mut ev = evidence(&v);
    ev.pop();
    post(&mut c, &v, "honest", ev);
}

#[test]
#[should_panic(expected = "system prompt is not the registered procedure")]
fn j7_a_different_prompt_is_rejected_even_with_a_valid_signature() {
    let (mut c, v) = court_setup();
    let ev = evidence(&v);
    post(&mut c, &v, "wrong_prompt", ev);
}

#[test]
#[should_panic(expected = "only one party of this dispute can commit evidence")]
fn j7_outsiders_cannot_commit_evidence() {
    let mut c = setup();
    wrap(&mut c, "buyer.testnet", 50, T0);
    let id = send(&mut c, "buyer.testnet", "seller.testnet", 50, T0);
    ctx("buyer.testnet", T0 + 1, BOND);
    c.report(id, "x".into());
    ctx("carol.testnet", T0 + 2, 0);
    c.commit_evidence(id, "ab".repeat(32));
}

#[test]
#[should_panic(expected = "the evidence deadline has passed")]
fn j7_late_evidence_is_rejected() {
    let mut c = setup();
    wrap(&mut c, "buyer.testnet", 50, T0);
    let id = send(&mut c, "buyer.testnet", "seller.testnet", 50, T0);
    ctx("buyer.testnet", T0 + 1, BOND);
    c.report(id, "x".into());
    ctx("seller.testnet", T0 + 40, 0);
    c.commit_evidence(id, "ab".repeat(32));
}

#[test]
#[should_panic(expected = "wait for the evidence deadline")]
fn j7_a_recommendation_cannot_skip_a_side_that_may_still_answer() {
    let mut c = setup();
    wrap(&mut c, "buyer.testnet", 50, T0);
    let id = send(&mut c, "buyer.testnet", "seller.testnet", 50, T0);
    ctx("buyer.testnet", T0 + 1, BOND);
    c.report(id, "x".into());
    ctx("buyer.testnet", T0 + 2, 0);
    c.commit_evidence(id, "ab".repeat(32));
    ctx("dao.testnet", T0 + 3, 0);
    c.register_tee_signer("z-ai/glm-5.3-flash".into(), vectors()["signer_pk_hex"].as_str().unwrap().into());
    c.register_procedure("cd".repeat(32), 800);
    ctx("anyone.testnet", T0 + 4, 0);
    c.post_recommendation(id, "m:a:b".into(), "00".repeat(64), "ab".repeat(80), "00".repeat(32), vec!["ab".repeat(80)], "{}".into(), "00".repeat(32));
}
