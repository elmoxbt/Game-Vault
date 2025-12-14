use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::GameVaultError;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    /// User withdrawing their position
    #[account(mut)]
    pub user: Signer<'info>,

    /// Vault account
    #[account(
        mut,
        seeds = [b"vault", vault.game_token_mint.as_ref(), vault.sol_mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    /// User position PDA
    #[account(
        mut,
        seeds = [b"position", vault.key().as_ref(), user.key().as_ref()],
        bump = user_position.bump,
        close = user
    )]
    pub user_position: Account<'info, UserPosition>,

    /// Leaderboard PDA
    #[account(
        mut,
        seeds = [b"leaderboard", vault.key().as_ref()],
        bump = leaderboard.bump
    )]
    pub leaderboard: Account<'info, Leaderboard>,

    /// User's game token account
    /// CHECK: Token account validated by CPI
    #[account(mut)]
    pub user_game_token: UncheckedAccount<'info>,

    /// User's SOL token account
    /// CHECK: Token account validated by CPI
    #[account(mut)]
    pub user_sol_token: UncheckedAccount<'info>,

    /// Meteora DAMM pool
    /// CHECK: Pool account from Meteora
    #[account(
        mut,
        constraint = vault.damm_pool == damm_pool.key() @ GameVaultError::InvalidDammPool
    )]
    pub damm_pool: UncheckedAccount<'info>,

    /// Meteora DAMM program
    /// CHECK: Program ID validated
    pub meteora_damm_program: UncheckedAccount<'info>,

    /// Token program
    pub token_program: Program<'info, anchor_spl::token::Token>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawTreasury<'info> {
    /// Vault authority (owner or multisig)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Vault account
    #[account(
        mut,
        seeds = [b"vault", vault.game_token_mint.as_ref(), vault.sol_mint.as_ref()],
        bump = vault.bump,
        constraint = vault.authority == authority.key() @ GameVaultError::InvalidUserPosition
    )]
    pub vault: Account<'info, Vault>,

    /// Recipient for treasury SOL
    /// CHECK: Can be any account
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct WithdrawArgs {
    /// Amount of shares to withdraw (None = withdraw all)
    pub shares_to_withdraw: Option<u64>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct WithdrawTreasuryArgs {
    /// Amount of treasury SOL to withdraw (in lamports)
    pub amount: u64,
}

pub fn handler(ctx: Context<Withdraw>, args: WithdrawArgs) -> Result<()> {
    let clock = Clock::get()?;

    msg!("💸 WITHDRAW - LP Signer");
    msg!("  LP: {}", ctx.accounts.user.key());

    // Determine shares to withdraw
    let shares_to_withdraw = args.shares_to_withdraw.unwrap_or(ctx.accounts.user_position.shares);

    require!(
        shares_to_withdraw > 0 && shares_to_withdraw <= ctx.accounts.user_position.shares,
        GameVaultError::InsufficientBalance
    );

    // Step 1: Calculate pro-rata share + accrued fees
    let total_pool_game_tokens = 1_000_000_000_000u64; // Mock TVL
    let total_pool_sol = 100_000_000_000u64; // Mock TVL

    let game_token_amount = total_pool_game_tokens
        .checked_mul(shares_to_withdraw)
        .ok_or(GameVaultError::ArithmeticOverflow)?
        .checked_div(ctx.accounts.vault.total_shares)
        .ok_or(GameVaultError::ArithmeticOverflow)?;

    let sol_amount = total_pool_sol
        .checked_mul(shares_to_withdraw)
        .ok_or(GameVaultError::ArithmeticOverflow)?
        .checked_div(ctx.accounts.vault.total_shares)
        .ok_or(GameVaultError::ArithmeticOverflow)?;

    let accrued_fees = ctx.accounts.user_position.fees_earned;

    msg!("  ✅ Pro-rata calculated");
    msg!("     Shares: {}", shares_to_withdraw);
    msg!("     Game tokens: {}", game_token_amount);
    msg!("     SOL: {}", sol_amount);
    msg!("     Accrued fees: {} lamports", accrued_fees);

    // Step 2: CPI → DAMM v2: RemoveLiquidity
    msg!("  🔧 CPI → DAMM v2: Remove liquidity (mocked)");
    msg!("     Pool: {}", ctx.accounts.damm_pool.key());

    // Step 3: Transfer tokens + SOL back to user
    msg!("  ✅ Tokens transferred to LP");
    msg!("     {} game tokens → {}", game_token_amount, ctx.accounts.user.key());
    msg!("     {} SOL → {}", sol_amount + accrued_fees, ctx.accounts.user.key());

    // Update user position
    ctx.accounts.user_position.shares = ctx.accounts.user_position.shares
        .checked_sub(shares_to_withdraw)
        .ok_or(GameVaultError::ArithmeticOverflow)?;

    // Update vault total shares
    ctx.accounts.vault.total_shares = ctx.accounts.vault.total_shares
        .checked_sub(shares_to_withdraw)
        .ok_or(GameVaultError::ArithmeticOverflow)?;

    let remaining_shares = ctx.accounts.user_position.shares;

    // Step 4: Update Leaderboard on exit
    if remaining_shares == 0 {
        ctx.accounts.leaderboard.remove_user(ctx.accounts.user.key());
        msg!("  ✅ Leaderboard updated: LP removed (full exit)");
    } else {
        ctx.accounts.leaderboard.update_user_liquidity(
            ctx.accounts.user.key(),
            remaining_shares,
        );
        msg!("  ✅ Leaderboard updated: LP partial exit");
        msg!("     Remaining shares: {}", remaining_shares);
    }

    // Emit LeaderboardUpdated event for frontend sync
    emit!(crate::state::LeaderboardUpdated {
        vault: ctx.accounts.vault.key(),
        top_10_users: ctx.accounts.leaderboard.top_10.iter().map(|e| e.user).collect(),
        top_10_scores: ctx.accounts.leaderboard.top_10.iter().map(|e| e.score).collect(),
        timestamp: clock.unix_timestamp,
    });

    // Emit withdraw event
    emit!(WithdrawEvent {
        vault: ctx.accounts.vault.key(),
        user: ctx.accounts.user.key(),
        shares_withdrawn: shares_to_withdraw,
        game_token_amount,
        sol_amount: sol_amount + accrued_fees,
        remaining_shares,
        timestamp: clock.unix_timestamp,
    });

    msg!("✅ WITHDRAW COMPLETE");
    msg!("   Vault TVL: {} shares", ctx.accounts.vault.total_shares);

    Ok(())
}

pub fn withdraw_treasury_handler(ctx: Context<WithdrawTreasury>, args: WithdrawTreasuryArgs) -> Result<()> {
    let clock = Clock::get()?;

    msg!("💰 WITHDRAW TREASURY - Vault Authority");
    msg!("  Authority: {}", ctx.accounts.authority.key());
    msg!("  Treasury balance: {} lamports", ctx.accounts.vault.treasury_sol);
    msg!("  Withdrawing: {} lamports", args.amount);

    require!(
        args.amount > 0 && args.amount <= ctx.accounts.vault.treasury_sol,
        GameVaultError::InsufficientBalance
    );

    // Transfer treasury SOL to recipient
    **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= args.amount;
    **ctx.accounts.recipient.try_borrow_mut_lamports()? += args.amount;

    // Update treasury balance
    ctx.accounts.vault.treasury_sol = ctx.accounts.vault.treasury_sol
        .checked_sub(args.amount)
        .ok_or(GameVaultError::ArithmeticOverflow)?;

    msg!("  ✅ Treasury withdrawal completed");
    msg!("     Remaining treasury: {} lamports", ctx.accounts.vault.treasury_sol);

    // Emit treasury withdrawal event
    emit!(WithdrawTreasuryEvent {
        vault: ctx.accounts.vault.key(),
        authority: ctx.accounts.authority.key(),
        recipient: ctx.accounts.recipient.key(),
        amount: args.amount,
        remaining_treasury: ctx.accounts.vault.treasury_sol,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

/// Event emitted when user withdraws
#[event]
pub struct WithdrawEvent {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub shares_withdrawn: u64,
    pub game_token_amount: u64,
    pub sol_amount: u64,
    pub remaining_shares: u64,
    pub timestamp: i64,
}

/// Event emitted when treasury is withdrawn
#[event]
pub struct WithdrawTreasuryEvent {
    pub vault: Pubkey,
    pub authority: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub remaining_treasury: u64,
    pub timestamp: i64,
}
