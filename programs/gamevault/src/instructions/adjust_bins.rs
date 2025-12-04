use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::GameVaultError;
use crate::utils::{
    fetch_pyth_price,
    calculate_price_range_from_volatility,
    price_to_sqrt_price,
};

#[derive(Accounts)]
pub struct AdjustBins<'info> {
    /// Anyone can call this instruction (permissionless)
    #[account(mut)]
    pub caller: Signer<'info>,

    /// Vault account
    #[account(
        mut,
        seeds = [b"vault", vault.game_token_mint.as_ref(), vault.sol_mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    /// Meteora DAMM v2 CP-AMM pool
    /// CHECK: Pool account from cloned Meteora repo
    #[account(
        mut,
        constraint = vault.damm_pool == damm_pool.key() @ GameVaultError::InvalidDammPool
    )]
    pub damm_pool: UncheckedAccount<'info>,

    /// Pyth price feed for game token
    /// CHECK: Validated in fetch_pyth_price
    pub pyth_price_feed: UncheckedAccount<'info>,

    /// Meteora DAMM program
    /// CHECK: Validated in CPI
    pub meteora_damm_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AdjustBins>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    msg!("🔄 ADJUST BINS - Auto sniper protection");
    msg!("  Caller: {}", ctx.accounts.caller.key());
    msg!("  Vault: {}", vault.key());

    // Step 1: Fetch latest Pyth price and confidence
    let (new_pyth_price, new_pyth_confidence) = fetch_pyth_price(
        &ctx.accounts.pyth_price_feed.to_account_info(),
        &clock,
    )?;

    msg!("  📊 Latest Pyth data:");
    msg!("    Price: ${}", new_pyth_price as f64 / 1e8);
    msg!("    Confidence: ${}", new_pyth_confidence as f64 / 1e8);

    // Step 2: Get stored volatility from last adjustment
    let old_pyth_price = vault.last_pyth_price;
    let old_pyth_confidence = vault.last_pyth_confidence;

    msg!("  📊 Previous Pyth data:");
    msg!("    Price: ${}", old_pyth_price as f64 / 1e8);
    msg!("    Confidence: ${}", old_pyth_confidence as f64 / 1e8);

    // Calculate volatility percentages
    let old_volatility = if old_pyth_price > 0 {
        (old_pyth_confidence as f64 / old_pyth_price as f64) * 100.0
    } else {
        0.0
    };

    let new_volatility = if new_pyth_price > 0 {
        (new_pyth_confidence as f64 / new_pyth_price as f64) * 100.0
    } else {
        0.0
    };

    msg!("  📈 Volatility comparison:");
    msg!("    Old volatility: {:.2}%", old_volatility);
    msg!("    New volatility: {:.2}%", new_volatility);

    // Step 3: Check if volatility changed > 20%
    let volatility_change = ((new_volatility - old_volatility) / old_volatility.max(0.01)) * 100.0;
    let volatility_change_abs = volatility_change.abs();

    msg!("    Volatility change: {:.2}%", volatility_change);

    const VOLATILITY_THRESHOLD: f64 = 20.0;

    require!(
        volatility_change_abs >= VOLATILITY_THRESHOLD,
        GameVaultError::VolatilityChangeInsufficient
    );

    msg!("  ✅ Volatility change >= {}% threshold", VOLATILITY_THRESHOLD);
    msg!("  🎯 Triggering bin adjustment...");

    // Step 4: Calculate old price range (for removal)
    let old_sqrt_price = price_to_sqrt_price(old_pyth_price as f64 / 1e8);
    let (old_sqrt_price_lower, old_sqrt_price_upper) = calculate_price_range_from_volatility(
        old_sqrt_price,
        old_pyth_price,
        old_pyth_confidence,
    );

    msg!("  📤 Removing liquidity from old range:");
    msg!("    Old sqrt_price: {}", old_sqrt_price);
    msg!("    Old range: [{}, {}]", old_sqrt_price_lower, old_sqrt_price_upper);

    // Step 5: Calculate new price range (for addition)
    let new_sqrt_price = price_to_sqrt_price(new_pyth_price as f64 / 1e8);
    let (new_sqrt_price_lower, new_sqrt_price_upper) = calculate_price_range_from_volatility(
        new_sqrt_price,
        new_pyth_price,
        new_pyth_confidence,
    );

    msg!("  📥 Adding liquidity to new range:");
    msg!("    New sqrt_price: {}", new_sqrt_price);
    msg!("    New range: [{}, {}]", new_sqrt_price_lower, new_sqrt_price_upper);

    // Step 6: CPI to Meteora - Remove liquidity from old bins
    // For Day 3: Mocked CPI (real implementation in Day 3+)
    msg!("  🔧 CPI → Meteora DAMM v2: Remove liquidity (mocked)");
    msg!("    Pool: {}", ctx.accounts.damm_pool.key());

    // Step 7: CPI to Meteora - Add liquidity to new bins
    msg!("  🔧 CPI → Meteora DAMM v2: Add liquidity (mocked)");
    msg!("    Pool: {}", ctx.accounts.damm_pool.key());

    // Step 8: Update vault state
    vault.last_pyth_price = new_pyth_price;
    vault.last_pyth_confidence = new_pyth_confidence;
    vault.last_bin_adjustment_timestamp = clock.unix_timestamp;

    // Step 9: Emit event
    emit!(BinsAdjustedEvent {
        vault: vault.key(),
        caller: ctx.accounts.caller.key(),
        old_volatility_percent: (old_volatility * 100.0) as u64, // Store as basis points
        new_volatility_percent: (new_volatility * 100.0) as u64,
        old_sqrt_price_lower,
        old_sqrt_price_upper,
        new_sqrt_price_lower,
        new_sqrt_price_upper,
        timestamp: clock.unix_timestamp,
    });

    msg!("✅ Bins adjusted successfully");
    msg!("   Old volatility: {:.2}%", old_volatility);
    msg!("   New volatility: {:.2}%", new_volatility);
    msg!("   Change: {:.2}%", volatility_change);
    msg!("   🛡️ Sniper protection updated!");

    Ok(())
}

/// Event emitted when bins are adjusted
#[event]
pub struct BinsAdjustedEvent {
    pub vault: Pubkey,
    pub caller: Pubkey,
    pub old_volatility_percent: u64,
    pub new_volatility_percent: u64,
    pub old_sqrt_price_lower: u128,
    pub old_sqrt_price_upper: u128,
    pub new_sqrt_price_lower: u128,
    pub new_sqrt_price_upper: u128,
    pub timestamp: i64,
}
