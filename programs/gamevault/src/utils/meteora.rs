use anchor_lang::prelude::*;

/// Meteora CP-AMM Program ID (devnet + mainnet)
/// This is DAMM v2 - Dynamic Automated Market Maker with:
/// - Single-sided deposits
/// - Dynamic fees based on volatility
/// - Constant product curve (x * y = k)
pub const METEORA_DAMM_PROGRAM_ID: Pubkey = pubkey!("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG");

/// Initialize a Meteora DAMM v2 pool (CP-AMM constant product)
///
/// DAMM v2 uses constant product curve (x * y = k) with:
/// - sqrt_price: Initial price as sqrt(token_b/token_a) in Q64.64 format
/// - liquidity: Initial liquidity amount
/// - Dynamic fees: Fees adjust based on market volatility
///
/// Returns the initialized pool's pubkey
pub fn cpi_initialize_damm_pool<'info>(
    _payer: &Signer<'info>,
    pool: &AccountInfo<'info>,
    _token_mint_x: &AccountInfo<'info>,
    _token_mint_y: &AccountInfo<'info>,
    _meteora_program: &AccountInfo<'info>,
    _system_program: &AccountInfo<'info>,
    _bin_step: u16,
    _base_fee_bps: u16,
) -> Result<Pubkey> {
    // DAMM v2 initialization via CP-AMM
    // For Day 2, we're mocking this to avoid complex account setup
    // Real implementation requires:
    // 1. Config account (static or dynamic)
    // 2. Token vaults for both mints
    // 3. Position NFT mint
    // 4. Pool authority PDA
    // 5. Initial liquidity via initialize_pool instruction
    //
    // Reference: meteora-cp-amm cloned repo at ../meteora-cp-amm/
    // - Program: programs/cp-amm/src/lib.rs
    // - Instruction: programs/cp-amm/src/instructions/initialize_pool/ix_initialize_pool.rs
    // - State: programs/cp-amm/src/state/pool.rs

    msg!("✅ DAMM v2 pool initialized (mock for Day 2)");
    msg!("   Pool: {}", pool.key());
    msg!("   Using Meteora CP-AMM (program ID: {})", METEORA_DAMM_PROGRAM_ID);
    msg!("   Dynamic fees: enabled");
    msg!("   Single-sided deposits: enabled");

    Ok(*pool.key)
}

/// Add liquidity to DAMM v2 pool with optimal price range
///
/// Uses Pyth confidence interval as volatility proxy to determine:
/// - Low volatility (tight confidence): Concentrated liquidity near current price
/// - High volatility (wide confidence): Spread liquidity across wider price range
///
/// DAMM v2 CP-AMM uses sqrt_price instead of discrete bins
///
/// Reference: meteora-cp-amm/programs/cp-amm/src/instructions/ix_add_liquidity.rs
pub fn cpi_add_liquidity_damm<'info>(
    _user: &Signer<'info>,
    _pool_account: &AccountInfo<'info>,
    _user_token_a: &AccountInfo<'info>,
    _user_token_b: &AccountInfo<'info>,
    _vault_a: &AccountInfo<'info>,
    _vault_b: &AccountInfo<'info>,
    position: &AccountInfo<'info>,
    _meteora_program: &AccountInfo<'info>,
    _token_program: &AccountInfo<'info>,
    amount_a: u64,
    amount_b: u64,
    sqrt_price: u128,
    pyth_confidence: u64,
) -> Result<u64> {
    // Validate amounts
    require!(
        amount_a > 0 || amount_b > 0,
        crate::error::GameVaultError::DepositTooSmall
    );

    msg!("Adding liquidity to DAMM v2 CP-AMM pool:");
    msg!("  Token A amount: {}", amount_a);
    msg!("  Token B amount: {}", amount_b);
    msg!("  Current sqrt_price: {}", sqrt_price);
    msg!("  Pyth confidence (volatility): {}", pyth_confidence);

    // Calculate liquidity from amounts and sqrt_price
    // liquidity = sqrt(amount_a * amount_b) in simplified form
    let liquidity = calculate_liquidity_from_amounts(amount_a, amount_b, sqrt_price);

    msg!("  Calculated liquidity: {}", liquidity);

    // For Day 2: Mock the add_liquidity CPI
    // Real implementation would use cp_amm::instructions::add_liquidity with:
    // - AddLiquidityParameters { liquidity, amount_a_max, amount_b_max }
    // - Proper account context (pool, position, vaults, mints, etc.)
    // Reference: meteora-cp-amm/programs/cp-amm/src/instructions/ix_add_liquidity.rs

    msg!("✅ Liquidity added to DAMM v2 pool (mock)");
    msg!("   Position: {}", position.key());
    msg!("   Shares minted: {}", liquidity);

    // Return liquidity as shares
    Ok(liquidity as u64)
}

/// Calculate liquidity from token amounts and sqrt_price
///
/// For CP-AMM (x * y = k):
/// L² = x * y (at current price)
/// L = sqrt(amount_a * amount_b)
///
/// This is simplified; real Meteora implementation uses:
/// L = Δy / (sqrt_price_upper - sqrt_price_lower)
/// Reference: meteora-cp-amm/programs/cp-amm/src/curve.rs
fn calculate_liquidity_from_amounts(
    amount_a: u64,
    amount_b: u64,
    _sqrt_price: u128,
) -> u128 {
    // Simplified liquidity calculation
    // Real Meteora uses precise Q64.64 math with price ranges

    if amount_a == 0 || amount_b == 0 {
        // Single-sided deposit: use the non-zero amount
        return (amount_a.max(amount_b) as u128) * 1_000_000; // Scale up for precision
    }

    // Both sides: geometric mean
    let product = (amount_a as u128).saturating_mul(amount_b as u128);
    integer_sqrt(product).saturating_mul(1_000_000) // Scale for precision
}

/// Integer square root using Newton's method
fn integer_sqrt(n: u128) -> u128 {
    if n == 0 {
        return 0;
    }

    let mut x = n;
    let mut y = (x + 1) / 2;

    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }

    x
}

/// Calculate optimal sqrt_price range based on Pyth confidence interval
///
/// Pyth confidence represents price uncertainty (volatility proxy):
/// - confidence / price < 1% → Low volatility → Tight range (±5%)
/// - confidence / price 1-5% → Medium volatility → Moderate range (±15%)
/// - confidence / price > 5% → High volatility → Wide range (±30%)
///
/// Returns (sqrt_price_lower, sqrt_price_upper) in Q64.64 format
pub fn calculate_price_range_from_volatility(
    current_sqrt_price: u128,
    pyth_price: i64,
    pyth_confidence: u64,
) -> (u128, u128) {
    // Calculate volatility ratio (confidence / price)
    let volatility_ratio = if pyth_price > 0 {
        (pyth_confidence as f64 / pyth_price as f64) * 100.0
    } else {
        5.0 // Default to medium volatility
    };

    msg!("Calculating price range from volatility:");
    msg!("  Volatility ratio: {:.2}%", volatility_ratio);

    // Determine range multiplier based on volatility
    let range_percent = if volatility_ratio < 1.0 {
        // Low volatility: Tight range (±5%)
        5.0
    } else if volatility_ratio < 5.0 {
        // Medium volatility: Moderate range (±15%)
        15.0
    } else {
        // High volatility: Wide range (±30%)
        30.0
    };

    msg!("  Price range: ±{}%", range_percent);

    // Calculate sqrt_price bounds
    // sqrt_price_lower = current_sqrt_price * sqrt(1 - range%)
    // sqrt_price_upper = current_sqrt_price * sqrt(1 + range%)

    let range_multiplier = range_percent / 100.0;
    let lower_multiplier = ((1.0 - range_multiplier) as f64).sqrt();
    let upper_multiplier = ((1.0 + range_multiplier) as f64).sqrt();

    let sqrt_price_lower = (current_sqrt_price as f64 * lower_multiplier) as u128;
    let sqrt_price_upper = (current_sqrt_price as f64 * upper_multiplier) as u128;

    msg!("  sqrt_price_lower: {}", sqrt_price_lower);
    msg!("  sqrt_price_upper: {}", sqrt_price_upper);

    (sqrt_price_lower, sqrt_price_upper)
}

/// Convert regular price to sqrt_price in Q64.64 format
///
/// Q64.64 means: value = (integer_part << 64) + fractional_part
/// For prices: sqrt_price = sqrt(price_b / price_a) * 2^64
pub fn price_to_sqrt_price(price: f64) -> u128 {
    let sqrt_price_f64 = price.sqrt();
    // Q64.64 format: multiply by 2^64
    let q64_scalar = (1u128 << 64) as f64;
    (sqrt_price_f64 * q64_scalar) as u128
}

/// Convert sqrt_price Q64.64 back to regular price
pub fn sqrt_price_to_price(sqrt_price: u128) -> f64 {
    let sqrt_price_f64 = sqrt_price as f64;
    let q64_scalar = (1u128 << 64) as f64;
    let sqrt_price_normalized = sqrt_price_f64 / q64_scalar;
    sqrt_price_normalized * sqrt_price_normalized
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_integer_sqrt() {
        assert_eq!(integer_sqrt(0), 0);
        assert_eq!(integer_sqrt(1), 1);
        assert_eq!(integer_sqrt(4), 2);
        assert_eq!(integer_sqrt(9), 3);
        assert_eq!(integer_sqrt(100), 10);
        assert_eq!(integer_sqrt(10000), 100);
    }

    #[test]
    fn test_liquidity_calculation() {
        let liq = calculate_liquidity_from_amounts(1000, 1000, 1 << 64);
        assert!(liq > 0);

        // Single-sided
        let liq_single = calculate_liquidity_from_amounts(1000, 0, 1 << 64);
        assert!(liq_single > 0);
    }

    #[test]
    fn test_price_conversions() {
        // Price of 1.0 (equal tokens)
        let sqrt_price = price_to_sqrt_price(1.0);
        let price_back = sqrt_price_to_price(sqrt_price);
        assert!((price_back - 1.0).abs() < 0.001);

        // Price of 100.0 (token B is 100x more valuable)
        let sqrt_price = price_to_sqrt_price(100.0);
        let price_back = sqrt_price_to_price(sqrt_price);
        assert!((price_back - 100.0).abs() < 0.1);
    }
}
