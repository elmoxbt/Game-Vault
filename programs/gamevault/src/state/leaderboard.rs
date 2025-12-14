use anchor_lang::prelude::*;

/// Individual leaderboard entry for a liquidity provider
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct LeaderboardEntry {
    /// User's public key
    pub user: Pubkey,

    /// Time-weighted liquidity score
    /// Calculated as: sum(liquidity_amount * time_held)
    pub score: u128,

    /// Total liquidity currently provided
    pub current_liquidity: u64,

    /// Timestamp when this position was last updated
    pub last_update_timestamp: i64,

    /// Total fees earned from wars
    pub total_fees_earned: u64,

    /// Number of times user was #1 defender
    pub defender_badges_earned: u32,
}

/// Leaderboard PDA - tracks top 10 liquidity providers
#[account]
#[derive(InitSpace)]
pub struct Leaderboard {
    /// Vault this leaderboard belongs to
    pub vault: Pubkey,

    /// Top 10 liquidity providers (sorted by score descending)
    #[max_len(10)]
    pub top_10: Vec<LeaderboardEntry>,

    /// Total number of unique LPs ever tracked
    pub total_lps: u64,

    /// Timestamp of last leaderboard update
    pub last_update_timestamp: i64,

    /// PDA bump
    pub bump: u8,
}

impl Leaderboard {
    /// Update or insert a user's leaderboard entry (deposit/withdraw flow)
    /// Follows architectural diagram: recalculate time-weighted shares → sort → take top 10
    /// Returns true if user is now in top 10
    pub fn update_entry(
        &mut self,
        user: Pubkey,
        liquidity_delta: i64, // Can be negative for withdrawals
        current_timestamp: i64,
    ) -> Result<bool> {
        // Step 1: Recalculate time-weighted shares for all LPs
        for entry in self.top_10.iter_mut() {
            let time_elapsed = current_timestamp - entry.last_update_timestamp;
            if time_elapsed > 0 {
                entry.score = entry.score
                    .checked_add((entry.current_liquidity as u128) * (time_elapsed as u128))
                    .unwrap_or(u128::MAX);
            }
            entry.last_update_timestamp = current_timestamp;
        }

        // Update current user's liquidity
        if let Some(entry) = self.top_10.iter_mut().find(|e| e.user == user) {
            if liquidity_delta >= 0 {
                entry.current_liquidity = entry.current_liquidity
                    .checked_add(liquidity_delta as u64)
                    .unwrap_or(u64::MAX);
            } else {
                entry.current_liquidity = entry.current_liquidity
                    .saturating_sub(liquidity_delta.abs() as u64);
            }
        } else {
            // New user - try to add
            let new_entry = LeaderboardEntry {
                user,
                score: 0,
                current_liquidity: if liquidity_delta > 0 { liquidity_delta as u64 } else { 0 },
                last_update_timestamp: current_timestamp,
                total_fees_earned: 0,
                defender_badges_earned: 0,
            };

            if self.top_10.len() < 10 {
                self.top_10.push(new_entry);
                self.total_lps += 1;
            } else {
                if let Some(lowest) = self.top_10.last() {
                    if new_entry.current_liquidity > lowest.current_liquidity {
                        self.top_10.pop();
                        self.top_10.push(new_entry);
                        self.total_lps += 1;
                    }
                }
            }
        }

        // Step 2: Sort by share descending
        self.sort_by_score();

        // Step 3: Take top 10 entries (already enforced by vec size)

        // Step 4: Overwrite Leaderboard PDA (happens automatically via &mut self)

        // Step 5: Update last_updated timestamp
        self.last_update_timestamp = current_timestamp;

        // Step 6: Emit event (handled by caller - deposit/withdraw instructions)

        Ok(self.top_10.iter().any(|e| e.user == user))
    }

    /// Sort top 10 by score descending
    fn sort_by_score(&mut self) {
        self.top_10.sort_by(|a, b| {
            b.score.cmp(&a.score)
                .then(b.current_liquidity.cmp(&a.current_liquidity))
        });
    }

    /// Get the #1 defender (highest score)
    pub fn get_top_defender(&self) -> Option<&LeaderboardEntry> {
        self.top_10.first()
    }

    /// Distribute fees to top 10 LPs
    /// Returns array of (user, fee_amount) for distribution
    pub fn calculate_fee_distribution(&self, total_fees: u64) -> Vec<(Pubkey, u64)> {
        if self.top_10.is_empty() {
            return vec![];
        }

        // 70% of fees distributed to top 10 based on score
        let distributable_amount = (total_fees as u128 * 70 / 100) as u64;

        // Calculate total score
        let total_score: u128 = self.top_10.iter().map(|e| e.score).sum();

        if total_score == 0 {
            // If no scores yet, distribute equally
            let per_user = distributable_amount / self.top_10.len() as u64;
            return self.top_10.iter()
                .map(|e| (e.user, per_user))
                .collect();
        }

        // Distribute proportionally by score
        self.top_10.iter()
            .map(|entry| {
                let fee_share = (distributable_amount as u128 * entry.score / total_score) as u64;
                (entry.user, fee_share)
            })
            .collect()
    }

    /// Record fees earned by a user
    pub fn record_fees_earned(&mut self, user: Pubkey, fees: u64) {
        if let Some(entry) = self.top_10.iter_mut().find(|e| e.user == user) {
            entry.total_fees_earned = entry.total_fees_earned.saturating_add(fees);
        }
    }

    /// Increment defender badge count for top defender
    pub fn award_defender_badge(&mut self) {
        if let Some(entry) = self.top_10.first_mut() {
            entry.defender_badges_earned = entry.defender_badges_earned.saturating_add(1);
        }
    }

    /// Remove user from leaderboard (on full withdrawal)
    pub fn remove_user(&mut self, user: Pubkey) {
        self.top_10.retain(|e| e.user != user);
    }

    /// Update user's liquidity amount (on partial withdrawal)
    pub fn update_user_liquidity(&mut self, user: Pubkey, new_liquidity: u64) {
        if let Some(entry) = self.top_10.iter_mut().find(|e| e.user == user) {
            entry.current_liquidity = new_liquidity;
        }
        self.sort_by_score();
    }
}

/// Event emitted when leaderboard is updated (for frontend sync)
#[event]
pub struct LeaderboardUpdated {
    pub vault: Pubkey,
    pub top_10_users: Vec<Pubkey>,
    pub top_10_scores: Vec<u128>,
    pub timestamp: i64,
}
