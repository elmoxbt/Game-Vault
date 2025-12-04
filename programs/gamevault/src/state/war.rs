use anchor_lang::prelude::*;

/// WarHistory Account - Tracks war statistics
/// PDA Seeds: ["war_history", vault]
#[account]
#[derive(InitSpace)]
pub struct WarHistory {
    /// Which vault this history tracks
    pub vault: Pubkey,

    /// Timestamp of last war
    pub last_war_timestamp: i64,

    /// Total number of wars executed
    pub total_wars: u64,

    /// Total fees distributed across all wars
    pub total_fees_distributed: u64,

    /// PDA bump seed
    pub bump: u8,
}

/// Single war record (not an account)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct WarRecord {
    /// When the war occurred
    pub timestamp: i64,

    /// Attack size in token amount
    pub attack_size: u64,

    /// Slippage absorbed in basis points (90 = 0.9%)
    pub slippage_absorbed: u16,

    /// Fees generated from the attack
    pub fees_generated: u64,

    /// Winner who received the badge
    pub defender: Pubkey,
}

// DefenderBadge: Metaplex Bubblegum compressed NFT
// Minted via CPI on Day 5
// Metadata: {"name": "Defender #N", "symbol": "DEF", "vault": vault_pubkey}
