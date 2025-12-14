use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

/// Real Meteora DAMM v2 (CP-AMM) Program ID
/// Devnet + Mainnet-Beta: CPMMigL2QrRRaS7bY5Rh5C32TTb6JvbEZ51w4sN3nX1J
///
/// NOTE: This is NOT the same as the mock program ID from Day 2.
/// This is the REAL on-chain verifiable Meteora CP-AMM program.
pub use cp_amm::ID as METEORA_DAMM_PROGRAM_ID;

// Re-export types from cp-amm for use in our program
pub use cp_amm::{
    cpi::accounts::InitializePoolCtx as MeteoraInitializePoolCtx,
    instructions::initialize_pool::InitializePoolParameters,
    state::{Config, Pool, Position},
};

/// Initialize a real Meteora DAMM v2 pool (CP-AMM constant product)
///
/// This creates a REAL on-chain pool using the official Meteora CP-AMM program.
/// Pool creation is verifiable on Solana explorers (Solscan, SolanaFM, etc.)
///
/// DAMM v2 CP-AMM features:
/// - Constant product curve (x * y = k)
/// - Dynamic fees based on volatility
/// - Single-sided deposits supported
/// - Position NFTs via Token-2022
/// - Configurable price ranges (sqrt_min_price to sqrt_max_price)
/// - Multiple accounts required for comprehensive pool initialization
pub fn cpi_initialize_meteora_pool<'info>(
    creator: &Signer<'info>,
    payer: &Signer<'info>,
    config: &AccountLoader<'info, Config>,
    pool_authority: &AccountInfo<'info>,
    pool: &AccountInfo<'info>,
    position: &AccountInfo<'info>,
    position_nft_mint: &Signer<'info>,
    position_nft_account: &AccountInfo<'info>,
    token_a_mint: &InterfaceAccount<'info, Mint>,
    token_b_mint: &InterfaceAccount<'info, Mint>,
    token_a_vault: &AccountInfo<'info>,
    token_b_vault: &AccountInfo<'info>,
    payer_token_a: &InterfaceAccount<'info, TokenAccount>,
    payer_token_b: &InterfaceAccount<'info, TokenAccount>,
    token_a_program: &Interface<'info, TokenInterface>,
    token_b_program: &Interface<'info, TokenInterface>,
    token_2022_program: &AccountInfo<'info>,
    meteora_program: &AccountInfo<'info>,
    event_authority: &AccountInfo<'info>,
    system_program: &Program<'info, System>,
    liquidity: u128,
    sqrt_price: u128,
) -> Result<Pubkey> {
    msg!("🔵 REAL Meteora DAMM v2 Pool Initialization");
    msg!("  Program ID: {}", METEORA_DAMM_PROGRAM_ID);
    msg!("  Pool: {}", pool.key());
    msg!("  Token A: {}", token_a_mint.key());
    msg!("  Token B: {}", token_b_mint.key());
    msg!("  Liquidity: {}", liquidity);
    msg!("  Sqrt Price (Q64.64): {}", sqrt_price);

    // Validate program ID
    require_keys_eq!(
        *meteora_program.key,
        METEORA_DAMM_PROGRAM_ID,
        crate::error::GameVaultError::InvalidDammPool
    );

    // Build CPI context for Meteora initialize_pool
    let cpi_accounts = cp_amm::cpi::accounts::InitializePoolCtx {
        creator: creator.to_account_info(),
        position_nft_mint: position_nft_mint.to_account_info(),
        position_nft_account: position_nft_account.to_account_info(),
        payer: payer.to_account_info(),
        config: config.to_account_info(),
        pool_authority: pool_authority.to_account_info(),
        pool: pool.to_account_info(),
        position: position.to_account_info(),
        token_a_mint: token_a_mint.to_account_info(),
        token_b_mint: token_b_mint.to_account_info(),
        token_a_vault: token_a_vault.to_account_info(),
        token_b_vault: token_b_vault.to_account_info(),
        payer_token_a: payer_token_a.to_account_info(),
        payer_token_b: payer_token_b.to_account_info(),
        token_a_program: token_a_program.to_account_info(),
        token_b_program: token_b_program.to_account_info(),
        token_2022_program: token_2022_program.to_account_info(),
        system_program: system_program.to_account_info(),
        event_authority: event_authority.to_account_info(),
        program: meteora_program.to_account_info(),
    };

    let cpi_ctx = CpiContext::new(meteora_program.to_account_info(), cpi_accounts);

    // Initialize pool parameters
    let params = InitializePoolParameters {
        liquidity,
        sqrt_price,
        activation_point: None, // Use default activation (immediate)
    };

    // Execute CPI to Meteora
    cp_amm::cpi::initialize_pool(cpi_ctx, params)?;

    msg!("✅ Real Meteora DAMM v2 pool initialized successfully");
    msg!("   Pool address: {}", pool.key());
    msg!("   Position NFT: {}", position_nft_mint.key());
    msg!("   This pool is now live on-chain and verifiable!");

    Ok(pool.key())
}

/// Mock CPI to add liquidity to Meteora DAMM pool
/// For Day 4: Returns mock shares based on deposit amount
/// - Requires multiple accounts for token transfers and position management
pub fn cpi_add_liquidity_damm<'info>(
    _user: &Signer<'info>,
    _pool: &AccountInfo<'info>,
    _user_token_a: &AccountInfo<'info>,
    _user_token_b: &AccountInfo<'info>,
    _vault_a: &AccountInfo<'info>,
    _vault_b: &AccountInfo<'info>,
    _position: &AccountInfo<'info>,
    _position_nft: &AccountInfo<'info>,
    _token_a_program: &AccountInfo<'info>,
    _token_b_program: &AccountInfo<'info>,
    _meteora_program: &AccountInfo<'info>,
    token_a_amount: u64,
    token_b_amount: u64,
    _sqrt_price_lower: u128,
    _sqrt_price_upper: u128,
) -> Result<u64> {
    msg!("🔧 CPI → Meteora DAMM: Add Liquidity (mocked for Day 4)");
    msg!("  Token A amount: {}", token_a_amount);
    msg!("  Token B amount: {}", token_b_amount);

    // Mock shares calculation: (token_a_amount + token_b_amount) / 2
    let shares_minted = (token_a_amount + token_b_amount) / 2;

    msg!("  ✅ Liquidity added (mocked)");
    msg!("  📊 Shares minted: {}", shares_minted);

    Ok(shares_minted)
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
