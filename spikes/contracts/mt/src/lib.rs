// S13 spike: NEP-245 multi token (open mint for testing only).
use near_sdk::{env, json_types::U128, near, PanicOnDefault};
use near_sdk_contract_tools::mt::*;

#[derive(PanicOnDefault, MultiToken)]
#[near(contract_state)]
pub struct Contract {}

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        let mut contract = Self {};
        contract.set_contract_metadata(&nep245::metadata::ContractMetadata::new("Spike MultiToken"));
        contract
    }

    pub fn mint(&mut self, token_id: String, amount: U128) {
        if self.token(&token_id).is_none() {
            self.create_token(token_id.clone())
                .unwrap_or_else(|e| env::panic_str(&e.to_string()));
        }
        Nep245Controller::mint(
            self,
            &Nep245Mint::single(token_id, amount.0, env::predecessor_account_id()),
        )
        .unwrap_or_else(|e| env::panic_str(&e.to_string()));
    }
}
