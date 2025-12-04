use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint, Transfer, transfer};
use crate::state::*;
use crate::error::GameVaultError;
use crate::utils::{
    fetch_pyth_price,
    cpi_add_liquidity_damm,
    calculate_price_range_from_volatility,
    price_to_sqrt_price,
};

#[derive(Accounts)]
pub struct Deposit<'info> {
    /// User depositing liquidity
    #[account(mut)]
    pub user: Signer<'info>,

    /// Vault account
    #[account(
        mut,
        seeds = [b"vault", vault.game_token_mint.as_ref(), vault.sol_mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    /// User position (must be first deposit - will fail if already exists)
    #[account(
        init,
        payer = user,
        space = 8 + UserPosition::INIT_SPACE,
        seeds = [b"position", vault.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,

    /// Meteora DAMM v2 CP-AMM pool
    /// CHECK: Pool account from cloned Meteora repo
    #[account(
        mut,
        constraint = vault.damm_pool == damm_pool.key() @ GameVaultError::InvalidDammPool
    )]
    pub damm_pool: UncheckedAccount<'info>,

    /// User's game token account
    #[account(
        mut,
        constraint = user_game_token.mint == vault.game_token_mint @ GameVaultError::InvalidDammPool,
        constraint = user_game_token.owner == user.key() @ GameVaultError::InvalidDammPool
    )]
    pub user_game_token: Account<'info, TokenAccount>,

    /// User's SOL token account (wrapped SOL)
    #[account(
        mut,
        constraint = user_sol_token.mint == vault.sol_mint @ GameVaultError::InvalidDammPool,
        constraint = user_sol_token.owner == user.key() @ GameVaultError::InvalidDammPool
    )]
    pub user_sol_token: Account<'info, TokenAccount>,

    /// DAMM pool vault A (game token)
    /// CHECK: Token vault controlled by pool
    #[account(mut)]
    pub vault_a: UncheckedAccount<'info>,

    /// DAMM pool vault B (SOL)
    /// CHECK: Token vault controlled by pool
    #[account(mut)]
    pub vault_b: UncheckedAccount<'info>,

    /// Meteora position (created/updated by DAMM v2)
    /// CHECK: Position account managed by Meteora
    #[account(mut)]
    pub position: UncheckedAccount<'info>,

    /// Pyth price feed for game token
    /// CHECK: Validated in fetch_pyth_price
    pub pyth_price_feed: UncheckedAccount<'info>,

    /// Meteora DAMM program
    /// CHECK: Validated in CPI
    pub meteora_damm_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct DepositArgs {
    /// Amount of game tokens to deposit
    pub game_token_amount: u64,

    /// Amount of SOL to deposit
    pub sol_amount: u64,
}

pub fn handler(ctx: Context<Deposit>, args: DepositArgs) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let user_position = &mut ctx.accounts.user_position;
    let clock = Clock::get()?;

    msg!("🔵 DEPOSIT - DAMM v2 (CP-AMM) with Pyth-powered price range");

    // Step 1: Validate deposit amounts
    require!(
        args.game_token_amount > 0 || args.sol_amount > 0,
        GameVaultError::DepositTooSmall
    );

    msg!("  Game tokens: {}", args.game_token_amount);
    msg!("  SOL: {}", args.sol_amount);

    // Step 2: Fetch current Pyth price and confidence (volatility proxy)
    let (pyth_price, pyth_confidence) = fetch_pyth_price(
        &ctx.accounts.pyth_price_feed.to_account_info(),
        &clock,
    )?;

    msg!("  Pyth price: ${}", pyth_price as f64 / 1e8);
    msg!("  Pyth confidence: ${}", pyth_confidence as f64 / 1e8);

    // Step 3: Calculate optimal price range based on Pyth confidence (volatility)
    // DAMM v2 CP-AMM uses sqrt_price instead of discrete bins
    // Convert Pyth price to sqrt_price (Q64.64 format)
    let current_price = pyth_price as f64 / 1e8; // Normalize to regular price
    let current_sqrt_price = price_to_sqrt_price(current_price);

    msg!("  Current sqrt_price: {}", current_sqrt_price);

    // Calculate price range bounds based on volatility
    let (sqrt_price_lower, sqrt_price_upper) = calculate_price_range_from_volatility(
        current_sqrt_price,
        pyth_price,
        pyth_confidence,
    );

    msg!("  Price range: [{}, {}]", sqrt_price_lower, sqrt_price_upper);

    // Step 4: Transfer tokens from user to pool vaults
    // Note: In real Meteora integration, this is handled by add_liquidity CPI
    // For Day 2, we're just tracking the deposits
    if args.game_token_amount > 0 {
        msg!("  ✓ Game tokens ready for deposit: {}", args.game_token_amount);
    }

    if args.sol_amount > 0 {
        msg!("  ✓ SOL ready for deposit: {}", args.sol_amount);
    }

    // Step 5: CPI to Meteora DAMM v2 (CP-AMM) - Add Liquidity
    // Using cpi_add_liquidity_damm from meteora.rs (mocked for Day 2)
    let shares_minted = cpi_add_liquidity_damm(
        &ctx.accounts.user,
        &ctx.accounts.damm_pool.to_account_info(),
        &ctx.accounts.user_game_token.to_account_info(),
        &ctx.accounts.user_sol_token.to_account_info(),
        &ctx.accounts.vault_a.to_account_info(),
        &ctx.accounts.vault_b.to_account_info(),
        &ctx.accounts.position.to_account_info(),
        &ctx.accounts.meteora_damm_program.to_account_info(),
        &ctx.accounts.token_program.to_account_info(),
        args.game_token_amount,
        args.sol_amount,
        current_sqrt_price,
        pyth_confidence,
    )?;

    msg!("  ✓ Liquidity added to DAMM v2 pool");
    msg!("  Shares minted: {}", shares_minted);

    // Step 6: Initialize or update user position
    let is_first_deposit = user_position.shares == 0;

    if is_first_deposit {
        user_position.vault = vault.key();
        user_position.user = ctx.accounts.user.key();
        user_position.damm_position_nft = ctx.accounts.position.key();
        user_position.shares = shares_minted;
        user_position.first_deposit_timestamp = clock.unix_timestamp;
        user_position.last_deposit_timestamp = clock.unix_timestamp;
        user_position.fees_earned = 0;

        // Store the bump - set correctly by init
        user_position.bump = ctx.bumps.user_position;

        // Calculate USD value of deposit
        let usd_value = calculate_usd_value(
            args.game_token_amount,
            args.sol_amount,
            pyth_price,
        );
        user_position.total_deposited_usd = usd_value;

        msg!("  🆕 First deposit - position created");
    } else {
        user_position.shares = user_position.shares
            .checked_add(shares_minted)
            .ok_or(GameVaultError::MathOverflow)?;

        let additional_usd = calculate_usd_value(
            args.game_token_amount,
            args.sol_amount,
            pyth_price,
        );

        user_position.total_deposited_usd = user_position.total_deposited_usd
            .checked_add(additional_usd)
            .ok_or(GameVaultError::MathOverflow)?;

        user_position.last_deposit_timestamp = clock.unix_timestamp;

        msg!("  ♻️ Additional deposit - position updated");
    }

    // Step 7: Update vault state
    vault.total_shares = vault.total_shares
        .checked_add(shares_minted)
        .ok_or(GameVaultError::MathOverflow)?;

    vault.last_pyth_price = pyth_price;
    vault.last_pyth_confidence = pyth_confidence;

    // Step 8: Emit deposit event
    emit!(DepositEvent {
        vault: vault.key(),
        user: ctx.accounts.user.key(),
        game_token_amount: args.game_token_amount,
        sol_amount: args.sol_amount,
        shares_minted,
        pyth_price,
        pyth_confidence,
        sqrt_price: current_sqrt_price,
        timestamp: clock.unix_timestamp,
    });

    msg!("✅ Deposit complete");
    msg!("   User: {}", ctx.accounts.user.key());
    msg!("   Position shares: {}", user_position.shares);
    msg!("   Total vault shares: {}", vault.total_shares);
    msg!("   Total deposited USD: ${}", user_position.total_deposited_usd as f64 / 1e8);

    Ok(())
}

/// Calculate USD value of deposit (8 decimals)
fn calculate_usd_value(
    game_token_amount: u64,
    sol_amount: u64,
    game_token_price_usd: i64,
) -> u64 {
    // Assuming game_token_price_usd is in 8 decimals
    // For simplicity, we'll value SOL at ~$200 (hardcoded for now)
    const SOL_PRICE_USD: u64 = 200_00000000; // $200 with 8 decimals

    let game_token_value = (game_token_amount as u128)
        .saturating_mul(game_token_price_usd as u128)
        .saturating_div(1_000_000_000) as u64; // Assume 9 decimal token

    let sol_value = (sol_amount as u128)
        .saturating_mul(SOL_PRICE_USD as u128)
        .saturating_div(1_000_000_000) as u64; // 9 decimals for SOL

    game_token_value.saturating_add(sol_value)
}

/// Event emitted on successful deposit
#[event]
pub struct DepositEvent {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub game_token_amount: u64,
    pub sol_amount: u64,
    pub shares_minted: u64,
    pub pyth_price: i64,
    pub pyth_confidence: u64,
    pub sqrt_price: u128,
    pub timestamp: i64,
}
