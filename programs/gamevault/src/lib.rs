use anchor_lang::prelude::*;

declare_id!("6wTDjykpx8e2LebgR7shGFaU9Xh57aSZGXmyqgF2ctsG");

pub mod error;
pub mod state;
pub mod instructions;
pub mod utils;

use instructions::*;

#[program]
pub mod gamevault {
    use super::*;

    /// Initialize a new GameVault with Meteora DAMM pool
    pub fn init_vault(
        ctx: Context<InitVault>,
        args: InitVaultArgs,
    ) -> Result<()> {
        instructions::init_vault::handler(ctx, args)
    }
}
