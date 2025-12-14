use anchor_lang::prelude::*;

/// Vault Account - Main liquidity vault state
/// PDA Seeds: ["vault", game_token_mint, sol_mint]
#[account]
#[derive(InitSpace)]
pub struct Vault {
    /// Program authority (usually the program itself)
    pub authority: Pubkey,

    /// The gaming token mint (e.g., $RAID)
    pub game_token_mint: Pubkey,

    /// Native SOL mint (So11111111111111111111111111111111111111112)
    pub sol_mint: Pubkey,

    /// Meteora DAMM v2 pool address created during init
    pub damm_pool: Pubkey,

    /// Total LP shares issued (for pro-rata withdrawals)
    pub total_shares: u64,

    /// Cached Pyth price from last update
    pub last_pyth_price: i64,

    /// Cached confidence interval (volatility proxy)
    pub last_pyth_confidence: u64,

    /// Timestamp of last adjust_bins call
    pub last_bin_adjustment_timestamp: i64,

    /// Timestamp of last adjust_bins call (5-min cooldown)
    pub last_adjust: i64,

    /// Treasury SOL accumulated from wars (10% of fees)
    pub treasury_sol: u64,

    /// PDA bump seed
    pub bump: u8,
}

/// Config Account - Global protocol settings
/// PDA Seeds: ["config"]
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Admin who can update settings
    pub authority: Pubkey,

    /// Token account holding bonus rewards for wars
    pub reward_pool: Pubkey,

    /// Minimum deposit amount (e.g., 0.1 SOL equivalent)
    pub min_deposit: u64,

    /// Confidence change % to trigger adjust (2000 = 20%)
    pub bin_adjustment_threshold: u16,

    /// War cooldown in seconds (86400 = 24 hours)
    pub war_cooldown: i64,

    /// PDA bump seed
    pub bump: u8,
}

/// UserPosition Account - Tracks individual LP position in vault
/// PDA Seeds: ["position", vault, user]
#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    /// Which vault this position belongs to
    pub vault: Pubkey,

    /// User who owns this position
    pub user: Pubkey,

    /// Meteora DAMM v2 position NFT address
    pub damm_position_nft: Pubkey,

    /// Vault shares owned (for pro-rata withdrawals)
    pub shares: u64,

    /// Total deposited value in USD (8 decimals)
    pub total_deposited_usd: u64,

    /// Timestamp of first deposit (for leaderboard scoring)
    pub first_deposit_timestamp: i64,

    /// Timestamp of last deposit
    pub last_deposit_timestamp: i64,

    /// Accumulated fees earned (in game tokens)
    pub fees_earned: u64,

    /// PDA bump seed
    pub bump: u8,
}
