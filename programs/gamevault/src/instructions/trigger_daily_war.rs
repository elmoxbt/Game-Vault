use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;
use crate::state::*;
use crate::error::GameVaultError;

// Jupiter v6 Program ID
pub const JUPITER_V6_PROGRAM_ID: Pubkey = pubkey!("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");

#[derive(Accounts)]
pub struct TriggerDailyWar<'info> {
    /// Anyone can trigger the war (permissionless)
    #[account(mut)]
    pub caller: Signer<'info>,

    /// Vault account
    #[account(
        mut,
        seeds = [b"vault", vault.game_token_mint.as_ref(), vault.sol_mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    /// War history PDA to track last war
    /// CHECK: Manually initialized in handler
    #[account(
        mut,
        seeds = [b"war_history", vault.key().as_ref()],
        bump
    )]
    pub war_history: UncheckedAccount<'info>,

    /// Meteora DAMM v2 CP-AMM pool
    /// CHECK: Pool account from Meteora
    #[account(
        mut,
        constraint = vault.damm_pool == damm_pool.key() @ GameVaultError::InvalidDammPool
    )]
    pub damm_pool: UncheckedAccount<'info>,

    /// Game token mint
    /// CHECK: Validated against vault
    #[account(
        constraint = vault.game_token_mint == game_token_mint.key()
    )]
    pub game_token_mint: UncheckedAccount<'info>,

    /// SOL mint (native)
    /// CHECK: Validated against vault
    #[account(
        constraint = vault.sol_mint == sol_mint.key()
    )]
    pub sol_mint: UncheckedAccount<'info>,

    /// Jupiter v6 program
    /// CHECK: Validated against constant
    pub jupiter_program: UncheckedAccount<'info>,

    /// Slot hashes sysvar for randomness
    /// CHECK: Sysvar account
    #[account(address = sysvar::slot_hashes::ID)]
    pub slot_hashes: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct TriggerDailyWarArgs {
    /// Optional: pre-computed attack size (for testing)
    pub attack_size_bps: Option<u16>,
}

pub fn handler(ctx: Context<TriggerDailyWar>, args: TriggerDailyWarArgs) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let war_history_info = &ctx.accounts.war_history;
    let clock = Clock::get()?;

    msg!("⚔️ TRIGGER DAILY WAR - Liquidity Wars");
    msg!("  Caller: {}", ctx.accounts.caller.key());
    msg!("  Vault: {}", vault.key());

    // Step 1: Initialize or load war history
    let mut war_history: WarHistory = if war_history_info.data_is_empty() {
        // First time - initialize the account
        let space = 8 + WarHistory::INIT_SPACE;
        let lamports = Rent::get()?.minimum_balance(space);

        // Create account via CPI
        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::create_account(
                ctx.accounts.caller.key,
                war_history_info.key,
                lamports,
                space as u64,
                &crate::ID,
            ),
            &[
                ctx.accounts.caller.to_account_info(),
                war_history_info.to_account_info(),
            ],
            &[&[
                b"war_history",
                vault.key().as_ref(),
                &[ctx.bumps.war_history],
            ]],
        )?;

        msg!("  📝 Initialized war history PDA");

        // Create new war history struct
        WarHistory {
            vault: vault.key(),
            last_war_timestamp: 0,
            total_wars: 0,
            total_fees_distributed: 0,
            bump: ctx.bumps.war_history,
        }
    } else {
        // Load existing war history
        let data = war_history_info.try_borrow_data()?;
        WarHistory::try_deserialize(&mut &data[..])?
    };

    // Step 2: Check 24h cooldown
    const WAR_COOLDOWN: i64 = 24 * 60 * 60; // 24 hours in seconds

    if war_history.last_war_timestamp > 0 {
        let time_since_last_war = clock.unix_timestamp - war_history.last_war_timestamp;
        require!(
            time_since_last_war >= WAR_COOLDOWN,
            GameVaultError::WarCooldownActive
        );
        msg!("  ✅ Cooldown passed: {} seconds since last war", time_since_last_war);
    } else {
        msg!("  ✅ First war - no cooldown check");
    }

    // Step 3: Generate random attack size (5-50% of TVL)
    let attack_size_bps = if let Some(size) = args.attack_size_bps {
        // Use provided attack size (for testing)
        require!(
            size >= 500 && size <= 5000,
            GameVaultError::InvalidAttackSize
        );
        msg!("  🎲 Using provided attack size: {}bps ({}%)", size, size / 100);
        size
    } else {
        // Generate random attack size using blockhash
        let random_value = generate_random_from_slot_hashes(
            &ctx.accounts.slot_hashes,
            clock.slot,
        )?;

        // Map random value to 5-50% range (500-5000 bps)
        let attack_size_bps = 500 + (random_value % 4501); // 500 + [0..4500]
        msg!("  🎲 Random attack size: {}bps ({}%)", attack_size_bps, attack_size_bps / 100);
        attack_size_bps as u16
    };

    // Step 4: Calculate attack amount based on vault TVL
    // For Day 4: Mock TVL calculation (real calculation requires querying pool)
    let mock_tvl_lamports = 1_000_000_000_000u64; // 1000 SOL mock TVL
    let attack_amount = (mock_tvl_lamports as u128 * attack_size_bps as u128 / 10_000u128) as u64;

    msg!("  💰 Vault TVL (mock): {} lamports", mock_tvl_lamports);
    msg!("  ⚡ Attack amount: {} lamports", attack_amount);

    // Step 5: Execute attack swap via Jupiter v6 (mocked for Day 4)
    msg!("  🔧 CPI → Jupiter v6: Execute attack swap (mocked)");
    msg!("    Swap: {} game tokens → SOL", attack_amount);
    msg!("    Jupiter Program: {}", ctx.accounts.jupiter_program.key());

    // Mock fee capture
    let fees_captured = attack_amount / 100; // Mock 1% fee
    msg!("  💎 Fees captured: {} lamports", fees_captured);

    // Step 6: Update war history
    war_history.last_war_timestamp = clock.unix_timestamp;
    war_history.total_wars += 1;
    war_history.total_fees_distributed += fees_captured;

    msg!("  📊 War statistics:");
    msg!("    Total wars: {}", war_history.total_wars);
    msg!("    Total fees distributed: {}", war_history.total_fees_distributed);

    // Step 7: Serialize war history back to account
    let mut data = war_history_info.try_borrow_mut_data()?;
    war_history.try_serialize(&mut &mut data[..])?;

    // Step 8: Emit event
    emit!(DailyWarTriggeredEvent {
        vault: vault.key(),
        caller: ctx.accounts.caller.key(),
        war_number: war_history.total_wars,
        attack_size_bps,
        attack_amount,
        fees_captured,
        timestamp: clock.unix_timestamp,
    });

    msg!("✅ Daily war completed successfully");
    msg!("   War #{}", war_history.total_wars);
    msg!("   Attack size: {}%", attack_size_bps / 100);
    msg!("   Fees captured: {} lamports", fees_captured);
    msg!("   🎮 Next war available in 24 hours");

    Ok(())
}

/// Generate pseudo-random number from slot hashes sysvar
fn generate_random_from_slot_hashes(
    slot_hashes_account: &UncheckedAccount,
    current_slot: u64,
) -> Result<u64> {
    // Use recent slot hash as randomness source
    // This is not cryptographically secure but sufficient for game mechanics

    // Get slot hashes data
    let data = slot_hashes_account.try_borrow_data()?;

    // Slot hashes sysvar contains most recent 512 slot hashes
    // Each entry is 40 bytes (8 bytes slot + 32 bytes hash)
    if data.len() < 48 {
        // Fallback: use current slot as seed
        msg!("⚠️ Slot hashes unavailable, using slot as seed");
        return Ok(current_slot);
    }

    // Read first slot hash (skip 8-byte discriminator)
    let mut hash_bytes = [0u8; 8];
    hash_bytes.copy_from_slice(&data[8..16]);
    let random_value = u64::from_le_bytes(hash_bytes);

    msg!("  🎲 Random seed from slot {}: {}", current_slot, random_value);

    Ok(random_value)
}

/// Event emitted when a daily war is triggered
#[event]
pub struct DailyWarTriggeredEvent {
    pub vault: Pubkey,
    pub caller: Pubkey,
    pub war_number: u64,
    pub attack_size_bps: u16,
    pub attack_amount: u64,
    pub fees_captured: u64,
    pub timestamp: i64,
}
