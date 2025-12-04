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

    /// Initialize a new GameVault with Meteora DAMM v2 pool
    pub fn init_vault(
        ctx: Context<InitVault>,
        args: InitVaultArgs,
    ) -> Result<()> {
        instructions::init_vault::handler(ctx, args)
    }

    /// Deposit liquidity into vault with Pyth-powered optimal bin placement
    pub fn deposit(
        ctx: Context<Deposit>,
        args: DepositArgs,
    ) -> Result<()> {
        instructions::deposit::handler(ctx, args)
    }

    /// Adjust bins based on volatility changes (sniper-killer)
    /// Anyone can call this to trigger rebalancing when volatility changes > 20%
    pub fn adjust_bins(
        ctx: Context<AdjustBins>,
    ) -> Result<()> {
        instructions::adjust_bins::handler(ctx)
    }
}
