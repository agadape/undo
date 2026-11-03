// S13 spike: NEP-171 + 177 + 178 + 181 non-fungible token (open mint for testing only).
use near_sdk::{env, near, PanicOnDefault};
use near_sdk_contract_tools::nft::*;

#[derive(NonFungibleToken, PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {}

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        let mut contract = Self {};
        contract.set_contract_metadata(&ContractMetadata::new(
            "Spike NFT".to_string(),
            "SPKNFT".to_string(),
            None,
        ));
        contract
    }

    pub fn mint(&mut self, token_id: TokenId, title: String) {
        let receiver = env::predecessor_account_id();
        self.mint_with_metadata(&token_id, &receiver, &TokenMetadata::new().title(title))
            .unwrap_or_else(|e| env::panic_str(&format!("Failed to mint: {:?}", e)));
    }
}
