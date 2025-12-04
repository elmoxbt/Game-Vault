use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};
use crate::state::*;
use crate::error::GameVaultError;
use crate::utils::{fetch_pyth_price, cpi_initialize_damm_pool};

/// Native SOL mint address
pub const NATIVE_SOL_MINT: Pubkey = pubkey!("So11111111111111111111111111111111111111112");

#[derive(Accounts)]
pub struct InitVault<'info> {
    /// Game dev who creates the vault
    #[account(mut)]
    pub maker: Signer<'info>,

    /// Vault PDA storing all vault metadata
    #[account(
        init,
        payer = maker,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", game_token_mint.key().as_ref(), sol_mint.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    /// Gaming token mint (e.g., $RAID)
    pub game_token_mint: Account<'info, Mint>,

    /// Native SOL mint
    pub sol_mint: Account<'info, Mint>,

    /// Meteora DAMM pool (will be created via CPI)
    /// CHECK: Created and validated by Meteora program
    #[account(mut)]
    pub damm_pool: UncheckedAccount<'info>,

    /// Pyth price feed for game_token/USD or game_token/SOL
    /// CHECK: Validated in fetch_pyth_price
    pub pyth_price_feed: UncheckedAccount<'info>,

    /// Meteora DAMM program
    /// CHECK: Validated against METEORA_DAMM_PROGRAM_ID
    pub meteora_damm_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitVaultArgs {
    /// Initial liquidity in game tokens
    pub initial_game_token_amount: u64,

    /// Initial liquidity in SOL
    pub initial_sol_amount: u64,

    /// DAMM bin step (100 = 1% per bin)
    pub bin_step: u16,

    /// Base trading fee in basis points (30 = 0.3%)
    pub base_fee_bps: u16,
}

pub fn handler(ctx: Context<InitVault>, args: InitVaultArgs) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    // Step 1: Validate inputs
    require!(
        args.initial_sol_amount > 0 && args.initial_game_token_amount > 0,
        GameVaultError::InvalidInitialLiquidity
    );

    require!(
        ctx.accounts.sol_mint.key() == NATIVE_SOL_MINT,
        GameVaultError::InvalidSolMint
    );

    // Step 2: Fetch initial Pyth price and confidence
    let (pyth_price, pyth_confidence) = fetch_pyth_price(
        &ctx.accounts.pyth_price_feed.to_account_info(),
        &clock,
    )?;

    msg!("Initial Pyth price: {}, confidence: {}", pyth_price, pyth_confidence);

    // Step 3: CPI to Meteora DAMM v2 - Initialize Pool
    // DAMM v2 specific: Dynamic fees, single-sided support, programmatic bin control
    let pool_address = cpi_initialize_damm_pool(
        &ctx.accounts.maker,
        &ctx.accounts.damm_pool.to_account_info(),
        &ctx.accounts.game_token_mint.to_account_info(),
        &ctx.accounts.sol_mint.to_account_info(),
        &ctx.accounts.meteora_damm_program.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        args.bin_step,
        args.base_fee_bps,
    )?;

    msg!("✅ DAMM v2 pool initialized: {}", pool_address);

    // Step 4: Initialize Vault account fields
    vault.authority = crate::ID; // Program is authority
    vault.game_token_mint = ctx.accounts.game_token_mint.key();
    vault.sol_mint = ctx.accounts.sol_mint.key();
    vault.damm_pool = pool_address;
    vault.total_shares = 0; // No LPs yet
    vault.last_pyth_price = pyth_price;
    vault.last_pyth_confidence = pyth_confidence;
    vault.last_bin_adjustment = clock.unix_timestamp;
    vault.bump = ctx.bumps.vault;

    // Step 5: Emit event
    emit!(VaultCreated {
        vault: vault.key(),
        damm_pool: pool_address,
        game_token_mint: ctx.accounts.game_token_mint.key(),
        initial_price: pyth_price,
        timestamp: clock.unix_timestamp,
    });

    msg!("✅ Vault created successfully");
    msg!("   Vault: {}", vault.key());
    msg!("   DAMM Pool: {}", pool_address);
    msg!("   Game Token: {}", ctx.accounts.game_token_mint.key());
    msg!("   Initial Price: ${}", pyth_price as f64 / 1e8);

    Ok(())
}

/// Event emitted when a vault is created
#[event]
pub struct VaultCreated {
    pub vault: Pubkey,
    pub damm_pool: Pubkey,
    pub game_token_mint: Pubkey,
    pub initial_price: i64,
    pub timestamp: i64,
}
