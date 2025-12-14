use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
pub struct InitLeaderboard<'info> {
    /// Payer for the leaderboard account
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Vault account this leaderboard tracks
    #[account(
        seeds = [b"vault", vault.game_token_mint.as_ref(), vault.sol_mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    /// Leaderboard PDA
    #[account(
        init,
        payer = payer,
        space = 8 + Leaderboard::INIT_SPACE,
        seeds = [b"leaderboard", vault.key().as_ref()],
        bump
    )]
    pub leaderboard: Account<'info, Leaderboard>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitLeaderboard>) -> Result<()> {
    let leaderboard = &mut ctx.accounts.leaderboard;
    let vault = &ctx.accounts.vault;
    let clock = Clock::get()?;

    leaderboard.vault = vault.key();
    leaderboard.top_10 = Vec::new();
    leaderboard.total_lps = 0;
    leaderboard.last_update_timestamp = clock.unix_timestamp;
    leaderboard.bump = ctx.bumps.leaderboard;

    msg!("📊 Leaderboard initialized for vault: {}", vault.key());

    Ok(())
}
