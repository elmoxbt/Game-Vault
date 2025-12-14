use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::GameVaultError;

/// Native SOL mint address
pub const NATIVE_SOL_MINT: Pubkey = pubkey!("So11111111111111111111111111111111111111112");

/// Test-only initialization that bypasses Meteora CPI
/// USE ONLY IN TESTS - NOT FOR PRODUCTION
#[derive(Accounts)]
pub struct InitVaultForTesting<'info> {
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

    /// Gaming token mint
    /// CHECK: Any mint is allowed for testing
    pub game_token_mint: AccountInfo<'info>,

    /// SOL mint
    /// CHECK: Validated against NATIVE_SOL_MINT
    pub sol_mint: AccountInfo<'info>,

    /// Mock DAMM pool address (doesn't need to exist)
    /// CHECK: Can be any address for testing
    pub damm_pool: AccountInfo<'info>,

    /// Mock Pyth price feed
    /// CHECK: Used for reading price data
    pub pyth_price_feed: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitVaultForTestingArgs {
    pub initial_price: i64,
    pub initial_confidence: u64,
}

pub fn handler(ctx: Context<InitVaultForTesting>, args: InitVaultForTestingArgs) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    msg!("🧪 INIT VAULT FOR TESTING - Test-only initialization");
    msg!("  ⚠️  WARNING: Bypasses Meteora CPI - FOR TESTING ONLY");

    // Validate SOL mint
    require!(
        ctx.accounts.sol_mint.key() == NATIVE_SOL_MINT,
        GameVaultError::InvalidSolMint
    );

    // Initialize Vault state
    vault.authority = crate::ID;
    vault.game_token_mint = ctx.accounts.game_token_mint.key();
    vault.sol_mint = ctx.accounts.sol_mint.key();
    vault.damm_pool = ctx.accounts.damm_pool.key();
    vault.total_shares = 0;
    vault.last_pyth_price = args.initial_price;
    vault.last_pyth_confidence = args.initial_confidence;
    vault.last_bin_adjustment_timestamp = 0;
    vault.last_adjust = 0; // Allows immediate first adjustment
    vault.treasury_sol = 0;
    vault.bump = ctx.bumps.vault;

    msg!("✅ Test vault initialized");
    msg!("   Vault: {}", vault.key());
    msg!("   Initial price: {}", args.initial_price);
    msg!("   Initial confidence: {}", args.initial_confidence);

    Ok(())
}
