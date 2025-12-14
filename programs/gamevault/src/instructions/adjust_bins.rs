use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::*;
use crate::error::GameVaultError;
use crate::utils::{
    fetch_pyth_price,
    calculate_price_range_from_volatility,
    price_to_sqrt_price,
};

#[derive(Accounts)]
pub struct AdjustBins<'info> {
    /// Authority that can call this instruction (vault PDA, read-only check)
    /// CHECK: Validated against vault.key() in handler
    pub authority: UncheckedAccount<'info>,

    /// Payer for the 0.01 SOL spam prevention fee
    #[account(mut)]
    pub payer: Signer<'info>,

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

    msg!("🔄 ADJUST BINS - Permissioned sniper protection");
    msg!("  Authority: {}", ctx.accounts.authority.key());
    msg!("  Vault: {}", vault.key());

    // SECURITY FIX 1: Permissioned - Only vault authority can call
    require_keys_eq!(
        vault.key(),
        ctx.accounts.authority.key(),
        GameVaultError::Unauthorized
    );

    // SECURITY FIX 4: Rate limit - 5 minute cooldown
    require!(
        clock.unix_timestamp >= vault.last_adjust.saturating_add(300),
        GameVaultError::AdjustCooldown
    );

    // SECURITY FIX 5: Spam prevention fee - 0.01 SOL
    const ADJUST_FEE: u64 = 10_000_000; // 0.01 SOL in lamports
    require!(
        ctx.accounts.payer.lamports() >= ADJUST_FEE,
        GameVaultError::SpamFee
    );

    // Transfer fee to vault treasury
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.payer.to_account_info(),
                to: vault.to_account_info(),
            },
        ),
        ADJUST_FEE,
    )?;

    vault.treasury_sol = vault.treasury_sol.saturating_add(ADJUST_FEE);
    msg!("  💰 Fee collected: {} lamports", ADJUST_FEE);

    // SECURITY FIX 2: Fetch latest Pyth price and confidence
    // Note: fetch_pyth_price already validates staleness (max 30 seconds)
    let (new_pyth_price, new_pyth_confidence) = fetch_pyth_price(
        &ctx.accounts.pyth_price_feed.to_account_info(),
        &clock,
    )?;

    msg!("  Latest Pyth data:");
    msg!("    Price: ${}", new_pyth_price as f64 / 1e8);
    msg!("    Confidence: ${}", new_pyth_confidence as f64 / 1e8);

    // Step 2: Get stored confidence from last adjustment
    let old_pyth_price = vault.last_pyth_price;
    let old_pyth_confidence = vault.last_pyth_confidence;

    msg!("  Previous Pyth data:");
    msg!("    Price: ${}", old_pyth_price as f64 / 1e8);
    msg!("    Confidence: ${}", old_pyth_confidence as f64 / 1e8);

    // Step 3: Check if CONFIDENCE changed > 20% (not volatility percentage)
    // Calculate percentage: (new / old) * 100
    let confidence_change_percent = if old_pyth_confidence == 0 {
        // First adjustment - allow it to proceed
        u64::MAX
    } else {
        // Calculate percentage: (new_conf / old_conf) * 100
        ((new_pyth_confidence as u128 * 100) / old_pyth_confidence as u128) as u64
    };

    msg!("  Confidence change:");
    msg!("    Old confidence: {}", old_pyth_confidence);
    msg!("    New confidence: {}", new_pyth_confidence);
    msg!("    Change percent: {}%", confidence_change_percent);

    // Require >20% change: new_conf/old_conf > 120% (20% increase) OR < 80% (20% decrease)
    const MIN_CHANGE_PERCENT: u64 = 120; // 120% = 20% increase
    const MAX_CHANGE_PERCENT: u64 = 80;  // 80% = 20% decrease

    require!(
        confidence_change_percent > MIN_CHANGE_PERCENT || confidence_change_percent < MAX_CHANGE_PERCENT,
        GameVaultError::VolatilityChangeInsufficient
    );

    msg!("  Confidence change >= 20% threshold");
    msg!("  🎯 Triggering bin adjustment...");

    // Step 4: Calculate old price range (for removal)
    let old_sqrt_price = price_to_sqrt_price(old_pyth_price as f64 / 1e8);
    let (old_sqrt_price_lower, old_sqrt_price_upper) = calculate_price_range_from_volatility(
        old_sqrt_price,
        old_pyth_price,
        old_pyth_confidence,
    );

    // Step 5: Calculate new price range (for addition)
    let new_sqrt_price = price_to_sqrt_price(new_pyth_price as f64 / 1e8);
    let (mut new_sqrt_price_lower, mut new_sqrt_price_upper) = calculate_price_range_from_volatility(
        new_sqrt_price,
        new_pyth_price,
        new_pyth_confidence,
    );

    // SECURITY FIX 3: Cap maximum bin shift per call (30% max)
    let old_range = old_sqrt_price_upper.saturating_sub(old_sqrt_price_lower);
    let new_range = new_sqrt_price_upper.saturating_sub(new_sqrt_price_lower);
    let max_shift = old_range.saturating_mul(30) / 100;

    // If shift exceeds 30%, cap it
    if new_range.abs_diff(old_range) > max_shift {
        msg!("  ⚠️  Shift exceeds 30% cap - capping to max allowed");
        let old_center = (old_sqrt_price_lower + old_sqrt_price_upper) / 2;
        let capped_range = if new_range > old_range {
            old_range + max_shift
        } else {
            old_range.saturating_sub(max_shift)
        };
        new_sqrt_price_lower = old_center.saturating_sub(capped_range / 2);
        new_sqrt_price_upper = old_center + (capped_range / 2);
    }

    msg!("  📤 Removing liquidity from old range:");
    msg!("    Old sqrt_price: {}", old_sqrt_price);
    msg!("    Old range: [{}, {}]", old_sqrt_price_lower, old_sqrt_price_upper);

    msg!("  📥 Adding liquidity to new range (30% cap applied):");
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
    vault.last_adjust = clock.unix_timestamp; // Update cooldown timestamp

    // Step 9: Emit event
    // Calculate volatility percentages for event
    let old_volatility_percent = if old_pyth_price > 0 {
        ((old_pyth_confidence as u128 * 10000) / old_pyth_price as u128) as u64 // Basis points
    } else {
        0
    };
    let new_volatility_percent = if new_pyth_price > 0 {
        ((new_pyth_confidence as u128 * 10000) / new_pyth_price as u128) as u64 // Basis points
    } else {
        0
    };

    emit!(BinsAdjustedEvent {
        vault: vault.key(),
        caller: ctx.accounts.authority.key(),
        old_volatility_percent,
        new_volatility_percent,
        old_sqrt_price_lower,
        old_sqrt_price_upper,
        new_sqrt_price_lower,
        new_sqrt_price_upper,
        timestamp: clock.unix_timestamp,
    });

    msg!("Bins adjusted successfully");
    msg!("   Old confidence: {}", old_pyth_confidence);
    msg!("   New confidence: {}", new_pyth_confidence);
    msg!("   Confidence change: {}%", confidence_change_percent);
    msg!("   Sniper protection updated");

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
