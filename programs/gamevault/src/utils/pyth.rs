use anchor_lang::prelude::*;
use crate::error::GameVaultError;

/// Stub for Pyth price fetching (full implementation on Day 2)
/// Returns (price, confidence_interval)
pub fn fetch_pyth_price(
    _price_feed: &AccountInfo,
    _clock: &Clock,
) -> Result<(i64, u64)> {
    // TODO: Day 2 - Parse Pyth Pull Oracle account
    // For now, return dummy values for compilation
    Ok((100_000_000, 1_000_000)) // $100 with $1 confidence
}

/// Validate Pyth price staleness (< 60 seconds old)
pub fn validate_pyth_staleness(
    publish_time: i64,
    current_time: i64,
) -> Result<()> {
    require!(
        current_time - publish_time < 60,
        GameVaultError::PythPriceStale
    );
    Ok(())
}
