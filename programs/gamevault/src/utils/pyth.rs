use anchor_lang::prelude::*;
use crate::error::GameVaultError;

/// Pyth Pull Oracle - Fetch current price and confidence interval
///
/// For Day 2: Mocked implementation that returns realistic test values
/// Real Pyth integration will be added in Day 3+ using pyth-solana-receiver-sdk
///
/// Returns: (price_i64, confidence_u64)
/// - price: Current price in fixed-point (e.g., $1.23 = 123000000 for 8 decimals)
/// - confidence: 1-sigma confidence interval (tighter = less volatile)
pub fn fetch_pyth_price(
    price_feed: &AccountInfo,
    clock: &Clock,
) -> Result<(i64, u64)> {
    msg!("Pyth Pull Oracle (MOCK for Day 2):");
    msg!("  Price feed: {}", price_feed.key());
    msg!("  Current time: {}", clock.unix_timestamp);

    // Mock price data for testing
    // Real implementation would deserialize Pyth PriceUpdateV2 account
    // Reference: pyth-solana-receiver-sdk crate (to be added Day 3+)

    let mock_price = 100_000_000i64; // $1.00 in 8 decimals
    let mock_confidence = 1_000_000u64; // $0.01 confidence (1% volatility)

    msg!("  Mock price: ${}", mock_price as f64 / 1e8);
    msg!("  Mock confidence: ${}", mock_confidence as f64 / 1e8);
    msg!("  Volatility: {:.2}%", (mock_confidence as f64 / mock_price as f64) * 100.0);

    // Validate mock data
    require!(
        mock_price > 0,
        GameVaultError::InvalidPythPrice
    );

    require!(
        mock_confidence <= mock_price as u64,
        GameVaultError::InvalidPythConfidence
    );

    Ok((mock_price, mock_confidence))
}

/// Normalize Pyth price from arbitrary exponent to 8 decimals (USD standard)
///
/// Pyth returns price with variable exponent (e.g., -8, -9, -6)
/// We normalize everything to 8 decimals for consistent calculations
///
/// Example:
/// - Pyth: price=123456789, exponent=-8 → $1.23456789
/// - Normalized: 123456789 (8 decimals)
fn normalize_price(price: i64, exponent: i32) -> i64 {
    let target_exponent = 8i32; // Standard USD precision
    let adjustment = target_exponent - exponent;

    if adjustment == 0 {
        price
    } else if adjustment > 0 {
        // Scale up (exponent was more negative than -8)
        price.saturating_mul(10i64.pow(adjustment as u32))
    } else {
        // Scale down (exponent was less negative than -8)
        price.saturating_div(10i64.pow((-adjustment) as u32))
    }
}

/// Validate Pyth price staleness (must be < 60 seconds old)
///
/// Stale prices are dangerous for DAMM v2 liquidity placement:
/// - Outdated confidence intervals lead to poor price range calculations
/// - Old prices can cause incorrect sqrt_price determinations
pub fn validate_pyth_staleness(
    publish_time: i64,
    current_time: i64,
) -> Result<()> {
    const MAX_AGE_SECONDS: i64 = 60;

    let age = current_time.saturating_sub(publish_time);

    require!(
        age <= MAX_AGE_SECONDS,
        GameVaultError::PythPriceStale
    );

    msg!("  Price age: {}s (max: {}s) ✓", age, MAX_AGE_SECONDS);

    Ok(())
}

/// Calculate volatility percentage from Pyth confidence
///
/// Volatility % = (confidence / price) * 100
/// - < 1% = Low volatility (tight market)
/// - 1-5% = Medium volatility (normal market)
/// - > 5% = High volatility (volatile market)
pub fn calculate_volatility_percentage(price: i64, confidence: u64) -> f64 {
    if price <= 0 {
        return 100.0; // Max volatility if invalid price
    }

    (confidence as f64 / price as f64) * 100.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_price() {
        // Price with exponent -8 (no change needed)
        assert_eq!(normalize_price(123456789, -8), 123456789);

        // Price with exponent -9 (scale up by 10x)
        assert_eq!(normalize_price(12345678, -9), 123456780);

        // Price with exponent -6 (scale down by 100x)
        assert_eq!(normalize_price(12345678, -6), 123456);
    }

    #[test]
    fn test_volatility_calculation() {
        // Low volatility: 0.5%
        let vol = calculate_volatility_percentage(100_000_000, 500_000);
        assert!((vol - 0.5).abs() < 0.01);

        // High volatility: 10%
        let vol = calculate_volatility_percentage(100_000_000, 10_000_000);
        assert!((vol - 10.0).abs() < 0.01);
    }
}
