use anchor_lang::prelude::*;

#[error_code]
pub enum GameVaultError {
    #[msg("Pyth price feed is stale (confidence too old)")]
    PythPriceStale,

    #[msg("Deposit amount below minimum threshold")]
    DepositTooSmall,

    #[msg("War cooldown not elapsed (24h required)")]
    WarCooldownActive,

    #[msg("Confidence interval change below adjustment threshold")]
    NoBinAdjustmentNeeded,

    #[msg("Volatility change insufficient for bin adjustment (< 20%)")]
    VolatilityChangeInsufficient,

    #[msg("Insufficient vault balance for withdrawal")]
    InsufficientBalance,

    #[msg("Invalid Meteora DAMM pool account")]
    InvalidDammPool,

    #[msg("Switchboard VRF request failed")]
    VrfRequestFailed,

    #[msg("Arithmetic overflow in calculation")]
    MathOverflow,

    #[msg("Invalid initial liquidity amounts")]
    InvalidInitialLiquidity,

    #[msg("Invalid SOL mint address")]
    InvalidSolMint,

    #[msg("Invalid Pyth price (must be positive)")]
    InvalidPythPrice,

    #[msg("Invalid Pyth confidence interval")]
    InvalidPythConfidence,

    #[msg("Invalid Pyth feed ID format")]
    InvalidPythFeedId,

    #[msg("User position account not found or invalid")]
    InvalidUserPosition,

    #[msg("Invalid attack size (must be 5-50%)")]
    InvalidAttackSize,

    #[msg("War not scheduled for current time (±5 minutes tolerance)")]
    WarNotScheduled,

    #[msg("Bonus war cooldown active (60s required)")]
    BonusWarCooldownActive,

    #[msg("Insufficient bonus war fee (0.05 SOL required)")]
    InsufficientBonusWarFee,

    #[msg("Vault TVL below minimum threshold (100 SOL required)")]
    InsufficientVaultTVL,

    #[msg("Arithmetic overflow detected")]
    ArithmeticOverflow,

    #[msg("Unauthorized: Only vault authority can call this instruction")]
    Unauthorized,

    #[msg("Excessive bin shift: Max 30% change per call")]
    ExcessiveBinShift,

    #[msg("Adjust cooldown active (5 minutes required)")]
    AdjustCooldown,

    #[msg("Insufficient fee for manual adjust_bins (0.01 SOL required)")]
    SpamFee,
}
