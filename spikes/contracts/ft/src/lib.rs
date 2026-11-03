// S13 spike: NEP-141 + NEP-145 + NEP-148 fungible token (open mint for testing only).
use near_sdk::{env, json_types::U128, near, PanicOnDefault};
use near_sdk_contract_tools::ft::*;

#[derive(FungibleToken, PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {}

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        let mut contract = Self {};
        contract.set_metadata(&ContractMetadata::new("Spike Token", "SPIKE", 6));
        contract
    }

    pub fn mint(&mut self, amount: U128) {
        Nep141Controller::mint(self, &Nep141Mint::new(amount.0, env::predecessor_account_id()))
            .unwrap_or_else(|e| env::panic_str(&e.to_string()));
    }
}
