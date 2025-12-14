use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token::{Mint, Token};
use anchor_spl::token_interface::{Mint as InterfaceMint, TokenAccount as InterfaceTokenAccount, TokenInterface};
use crate::state::*;
use crate::error::GameVaultError;
use crate::utils::{fetch_pyth_price, cpi_initialize_meteora_pool, price_to_sqrt_price, METEORA_DAMM_PROGRAM_ID};
use cp_amm::state::{Config, Pool, Position};

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
    pub game_token_mint: Box<InterfaceAccount<'info, InterfaceMint>>,

    /// Native SOL mint (wrapped SOL)
    pub sol_mint: Box<InterfaceAccount<'info, InterfaceMint>>,

    // === REAL METEORA DAMM v2 ACCOUNTS ===
    // These accounts are required by the official Meteora CP-AMM program
    // Reference: meteora-cp-amm/programs/cp-amm/src/instructions/initialize_pool/ix_initialize_pool.rs

    /// Meteora config account (pre-created static or dynamic config)
    /// Must be created before pool initialization via create_config instruction
    pub config: AccountLoader<'info, Config>,

    /// Meteora pool authority (global PDA, same for all pools)
    /// PDA: [b"pool_authority"] derived from Meteora program
    /// CHECK: Validated by Meteora program during CPI
    pub pool_authority: UncheckedAccount<'info>,

    /// Meteora pool account (will be initialized via CPI)
    /// PDA: [b"pool", config.key(), max(token_a, token_b), min(token_a, token_b)]
    /// CHECK: Will be initialized by Meteora program via CPI
    #[account(mut)]
    pub damm_pool: UncheckedAccount<'info>,

    /// Position NFT mint (Token-2022, must be a signer, will be initialized by Meteora)
    /// CHECK: Will be initialized by Meteora program via CPI
    #[account(mut, signer)]
    pub position_nft_mint: Signer<'info>,

    /// Position NFT token account (holds the NFT for the creator)
    /// PDA: [b"position_nft_account", position_nft_mint.key()] - derived from METEORA program
    /// CHECK: Will be initialized by Meteora program via CPI
    #[account(mut)]
    pub position_nft_account: UncheckedAccount<'info>,

    /// Position account (tracks liquidity position)
    /// PDA: [b"position", position_nft_mint.key()]
    /// CHECK: Will be initialized by Meteora program via CPI
    #[account(mut)]
    pub position: UncheckedAccount<'info>,

    /// Token A vault (game token vault for the pool)
    /// PDA: [b"token_vault", game_token_mint.key(), pool.key()]
    /// CHECK: Will be initialized by Meteora program via CPI
    #[account(mut)]
    pub token_a_vault: UncheckedAccount<'info>,

    /// Token B vault (SOL vault for the pool)
    /// PDA: [b"token_vault", sol_mint.key(), pool.key()]
    /// CHECK: Will be initialized by Meteora program via CPI
    #[account(mut)]
    pub token_b_vault: UncheckedAccount<'info>,

    /// Payer's game token account (source for initial liquidity)
    #[account(mut)]
    pub payer_token_a: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,

    /// Payer's SOL token account (source for initial liquidity)
    #[account(mut)]
    pub payer_token_b: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,

    /// Pyth price feed for game_token/USD or game_token/SOL
    /// CHECK: Validated in fetch_pyth_price
    pub pyth_price_feed: UncheckedAccount<'info>,

    /// Token program for game token (could be Token or Token2022)
    pub token_a_program: Interface<'info, TokenInterface>,

    /// Token program for SOL (usually standard Token program)
    pub token_b_program: Interface<'info, TokenInterface>,

    /// Token-2022 program (for position NFT)
    pub token_2022_program: Program<'info, Token2022>,

    /// Meteora DAMM program
    /// CHECK: Validated against METEORA_DAMM_PROGRAM_ID in CPI function
    pub meteora_damm_program: UncheckedAccount<'info>,

    /// Event authority PDA for Meteora CPI events
    /// PDA: [b"__event_authority"] derived from Meteora program
    /// CHECK: Required by Meteora's event_cpi macro
    pub event_authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

// Helper functions for PDA derivation (matching Meteora's logic)
fn max_key(left: &Pubkey, right: &Pubkey) -> [u8; 32] {
    std::cmp::max(left, right).to_bytes()
}

fn min_key(left: &Pubkey, right: &Pubkey) -> [u8; 32] {
    std::cmp::min(left, right).to_bytes()
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitVaultArgs {
    /// Initial liquidity amount (in pool shares)
    pub liquidity: u64,

    /// Initial price as regular price (e.g., 1.0 for 1:1 ratio)
    /// Will be converted to sqrt_price Q64.64 format
    pub initial_price: f64,
}

pub fn handler(ctx: Context<InitVault>, args: InitVaultArgs) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    msg!("🏗️  INIT VAULT - Game Dev Signer");
    msg!("  Maker: {}", ctx.accounts.maker.key());
    msg!("  Game Token: {}", ctx.accounts.game_token_mint.key());

    // Step 1: Create Vault PDA (seed: [b"vault", game_token, sol_mint])
    // Note: Vault PDA is automatically created by Anchor's #[account(init)] macro
    // Seeds: [b"vault", game_token_mint.key(), sol_mint.key()]
    msg!("  ✅ Vault PDA created: {}", vault.key());

    // Validate SOL mint
    require!(
        ctx.accounts.sol_mint.key() == NATIVE_SOL_MINT,
        GameVaultError::InvalidSolMint
    );

    // Validate liquidity
    require!(
        args.liquidity > 0,
        GameVaultError::InvalidInitialLiquidity
    );

    require!(
        args.initial_price > 0.0,
        GameVaultError::InvalidInitialLiquidity
    );

    // Step 2: CPI → Meteora DAMM v2: InitializePool (dynamic fees, single-sided)
    let sqrt_price = price_to_sqrt_price(args.initial_price);
    msg!("  💧 Initializing Meteora DAMM v2 pool...");
    msg!("     Initial sqrt_price: {}", sqrt_price);

    let pool_address = cpi_initialize_meteora_pool(
        &ctx.accounts.maker,
        &ctx.accounts.maker,
        &ctx.accounts.config,
        &ctx.accounts.pool_authority.to_account_info(),
        &ctx.accounts.damm_pool.to_account_info(),
        &ctx.accounts.position.to_account_info(),
        &ctx.accounts.position_nft_mint,
        &ctx.accounts.position_nft_account.to_account_info(),
        &ctx.accounts.game_token_mint,
        &ctx.accounts.sol_mint,
        &ctx.accounts.token_a_vault.to_account_info(),
        &ctx.accounts.token_b_vault.to_account_info(),
        &ctx.accounts.payer_token_a,
        &ctx.accounts.payer_token_b,
        &ctx.accounts.token_a_program,
        &ctx.accounts.token_b_program,
        &ctx.accounts.token_2022_program.to_account_info(),
        &ctx.accounts.meteora_damm_program.to_account_info(),
        &ctx.accounts.event_authority.to_account_info(),
        &ctx.accounts.system_program,
        args.liquidity as u128,
        sqrt_price,
    )?;

    msg!("  ✅ Meteora DAMM v2 pool initialized: {}", pool_address);

    // Step 3: Pyth Pull → Store initial price + confidence
    msg!("  📊 Fetching Pyth price feed...");
    let (pyth_price, pyth_confidence) = fetch_pyth_price(
        &ctx.accounts.pyth_price_feed.to_account_info(),
        &clock,
    )?;

    msg!("  ✅ Pyth price stored: ${}", pyth_price as f64 / 1e8);
    msg!("     Confidence: ${}", pyth_confidence as f64 / 1e8);

    // Step 4: Initialize Vault state with Pyth data
    vault.authority = crate::ID; // Program is authority
    vault.game_token_mint = ctx.accounts.game_token_mint.key();
    vault.sol_mint = ctx.accounts.sol_mint.key();
    vault.damm_pool = pool_address;
    vault.total_shares = 0; // No additional LPs yet
    vault.last_pyth_price = pyth_price;
    vault.last_pyth_confidence = pyth_confidence;
    vault.last_bin_adjustment_timestamp = clock.unix_timestamp;
    vault.last_adjust = 0;
    vault.treasury_sol = 0;
    vault.bump = ctx.bumps.vault;

    // Step 5: Vault Ready (min TVL check implicit via liquidity requirement)
    msg!("  ✅ Vault Ready - min TVL: {} shares", args.liquidity);

    // Emit creation event
    emit!(VaultCreated {
        vault: vault.key(),
        damm_pool: pool_address,
        game_token_mint: ctx.accounts.game_token_mint.key(),
        initial_price: pyth_price,
        sqrt_price,
        liquidity: args.liquidity,
        timestamp: clock.unix_timestamp,
    });

    // Emit VaultInitialized event (for test compatibility)
    emit!(VaultInitialized {
        vault: vault.key(),
        damm_pool: pool_address,
        game_token_mint: ctx.accounts.game_token_mint.key(),
        initial_price: pyth_price,
        sqrt_price,
        liquidity: args.liquidity,
        timestamp: clock.unix_timestamp,
    });

    msg!("✅ INIT VAULT COMPLETE");
    msg!("   Vault PDA: {}", vault.key());
    msg!("   DAMM Pool: {}", pool_address);
    msg!("   Initial TVL: {} shares", args.liquidity);

    Ok(())
}

/// Event emitted when a vault is created
#[event]
pub struct VaultCreated {
    pub vault: Pubkey,
    pub damm_pool: Pubkey,
    pub game_token_mint: Pubkey,
    pub initial_price: i64,
    pub sqrt_price: u128,
    pub liquidity: u64,
    pub timestamp: i64,
}

/// Event emitted when a vault is initialized (alias for VaultCreated)
#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub damm_pool: Pubkey,
    pub game_token_mint: Pubkey,
    pub initial_price: i64,
    pub sqrt_price: u128,
    pub liquidity: u64,
    pub timestamp: i64,
}
