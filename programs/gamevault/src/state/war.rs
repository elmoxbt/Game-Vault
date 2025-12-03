use anchor_lang::prelude::*;

/// WarHistory Account - Circular buffer of last 30 wars
/// PDA Seeds: ["war_history", vault]
#[account]
#[derive(InitSpace)]
pub struct WarHistory {
    /// Which vault this history tracks
    pub vault: Pubkey,

    /// Last 30 wars, FIFO circular buffer
    #[max_len(30)]
    pub wars: Vec<WarRecord>,

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
