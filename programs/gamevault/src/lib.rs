#![allow(unexpected_cfgs)]
#![allow(deprecated)]

use anchor_lang::prelude::*;

declare_id!("9h99ZKZpprYZn2xaBEQC2R62BJCCYFMg7XEjTDzqAxk5");

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

    /// Initialize vault for testing (bypasses Meteora CPI)
    /// ⚠️ TEST ONLY - DO NOT USE IN PRODUCTION
    pub fn init_vault_for_testing(
        ctx: Context<InitVaultForTesting>,
        args: InitVaultForTestingArgs,
    ) -> Result<()> {
        instructions::init_vault_for_testing::handler(ctx, args)
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

    /// Initialize leaderboard for a vault
    pub fn init_leaderboard(
        ctx: Context<InitLeaderboard>,
    ) -> Result<()> {
        instructions::init_leaderboard::handler(ctx)
    }

    /// Trigger daily liquidity war (permissionless)
    /// Executes random attack swap and distributes fees
    pub fn trigger_daily_war(
        ctx: Context<TriggerDailyWar>,
        args: TriggerDailyWarArgs,
    ) -> Result<()> {
        instructions::trigger_daily_war::handler(ctx, args)
    }

    /// Withdraw liquidity from vault
    pub fn withdraw(
        ctx: Context<Withdraw>,
        args: WithdrawArgs,
    ) -> Result<()> {
        instructions::withdraw::handler(ctx, args)
    }

    /// Withdraw treasury SOL (vault authority only)
    pub fn withdraw_treasury(
        ctx: Context<WithdrawTreasury>,
        args: WithdrawTreasuryArgs,
    ) -> Result<()> {
        instructions::withdraw::withdraw_treasury_handler(ctx, args)
    }
}
