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
}
