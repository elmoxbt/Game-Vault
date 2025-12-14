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

    // Try to read actual price data from account (for testing)
    let (price, confidence, publish_time) = if price_feed.data_len() >= 3200 {
        let data = price_feed.try_borrow_data()?;

        // Read price data from buffer (Pyth format)
        let price_raw = i64::from_le_bytes([
            data[32], data[33], data[34], data[35],
            data[36], data[37], data[38], data[39],
        ]);

        let confidence_raw = u64::from_le_bytes([
            data[40], data[41], data[42], data[43],
            data[44], data[45], data[46], data[47],
        ]);

        let exponent = i32::from_le_bytes([
            data[48], data[49], data[50], data[51],
        ]);

        let publish_time = i64::from_le_bytes([
            data[64], data[65], data[66], data[67],
            data[68], data[69], data[70], data[71],
        ]);

        msg!("  Reading from Pyth account data");
        msg!("  Raw price: {}, exponent: {}", price_raw, exponent);

        // Normalize to 8 decimals
        let normalized_price = normalize_price(price_raw, exponent);
        let normalized_confidence = if exponent == -8 {
            confidence_raw
        } else {
            let adjustment = 8i32 - exponent;
            if adjustment > 0 {
                confidence_raw.saturating_mul(10u64.pow(adjustment as u32))
            } else {
                confidence_raw.saturating_div(10u64.pow((-adjustment) as u32))
            }
        };

        (normalized_price, normalized_confidence, publish_time)
    } else {
        // Fallback to hardcoded mock if account doesn't have expected data
        msg!("  Using hardcoded mock values (account too small)");
        (100_000_000i64, 1_000_000u64, clock.unix_timestamp)
    };

    msg!("  Price: ${}", price as f64 / 1e8);
    msg!("  Confidence: ${}", confidence as f64 / 1e8);
    msg!("  Volatility: {:.2}%", (confidence as f64 / price as f64) * 100.0);

    // Validate staleness (max 30 seconds for adjust_bins)
    const MAX_AGE_SECONDS: i64 = 30;
    let age = clock.unix_timestamp.saturating_sub(publish_time);

    require!(
        age <= MAX_AGE_SECONDS,
        GameVaultError::PythPriceStale
    );

    msg!("  Price age: {}s (max: {}s) ✓", age, MAX_AGE_SECONDS);

    // Validate price data
    require!(
        price > 0,
        GameVaultError::InvalidPythPrice
    );

    require!(
        confidence <= price as u64,
        GameVaultError::InvalidPythConfidence
    );

    Ok((price, confidence))
}

/// Normalize Pyth price from arbitrary exponent to 8 decimals (USD standard)
///
/// Pyth returns price with variable exponent (e.g., -8, -9, -6)
/// We normalize everything to 8 decimals for consistent calculations
///
/// Example:
/// - Pyth: price=123456789, exponent=-8 → $1.23456789
/// - Normalized: 123456789 (8 decimals)
pub fn normalize_price(price: i64, exponent: i32) -> i64 {
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
