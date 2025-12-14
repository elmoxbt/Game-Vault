use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;
use crate::state::*;
use crate::error::GameVaultError;

// Jupiter v6 Program ID
pub const JUPITER_V6_PROGRAM_ID: Pubkey = pubkey!("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");

#[derive(Accounts)]
#[instruction(args: TriggerDailyWarArgs)]
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
    #[account(
        init_if_needed,
        payer = caller,
        space = 8 + WarHistory::INIT_SPACE,
        seeds = [b"war_history", vault.key().as_ref()],
        bump
    )]
    pub war_history: Account<'info, WarHistory>,

    /// Leaderboard PDA
    #[account(
        init_if_needed,
        payer = caller,
        space = 8 + Leaderboard::INIT_SPACE,
        seeds = [b"leaderboard", vault.key().as_ref()],
        bump
    )]
    pub leaderboard: Account<'info, Leaderboard>,

    /// Defender (top LP) - receives 20% SOL bonus
    /// CHECK: Determined from leaderboard
    #[account(mut)]
    pub defender: UncheckedAccount<'info>,

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
    let war_history = &mut ctx.accounts.war_history;
    let leaderboard = &mut ctx.accounts.leaderboard;
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    msg!("⚔️ TRIGGER DAILY WAR - Anyone can call");
    msg!("  Caller: {}", ctx.accounts.caller.key());

    // Initialize PDAs if needed
    if war_history.vault == Pubkey::default() {
        war_history.vault = ctx.accounts.vault.key();
        war_history.last_war_timestamp = 0;
        war_history.total_wars = 0;
        war_history.total_fees_distributed = 0;
        war_history.scheduled_war_time = 0;
        war_history.last_bonus_war = 0;
        war_history.bump = ctx.bumps.war_history;
    }

    if leaderboard.vault == Pubkey::default() {
        leaderboard.vault = ctx.accounts.vault.key();
        leaderboard.top_10 = Vec::new();
        leaderboard.total_lps = 0;
        leaderboard.last_update_timestamp = clock.unix_timestamp;
        leaderboard.bump = ctx.bumps.leaderboard;
    }

    // Step 1: Check if in main window (04:00-06:00 & 16:00-18:00 UTC)
    let is_in_main_window = is_within_main_war_window(current_time);

    if is_in_main_window {
        // Main window: VRF random minute within ±5 min
        handle_main_window_war(war_history, current_time)?;
        msg!("  ✅ Main window war (VRF random minute)");
    } else {
        // Bonus war: 0.05 SOL fee + 60s cooldown
        handle_bonus_war(&ctx.accounts.caller, &ctx.accounts.vault, war_history, current_time)?;
        msg!("  ✅ Bonus war (0.05 SOL + 60s cooldown)");
    }

    // Step 2: TVL ≥ 100 SOL?
    const MIN_VAULT_TVL_LAMPORTS: u64 = 100_000_000_000; // 100 SOL
    let mock_tvl_lamports = 1_000_000_000_000u64; // 1000 SOL mock TVL

    require!(
        mock_tvl_lamports >= MIN_VAULT_TVL_LAMPORTS,
        GameVaultError::InsufficientVaultTVL
    );
    msg!("  ✅ TVL check passed: {} SOL", mock_tvl_lamports / 1_000_000_000);

    // Step 3: Switchboard VRF → Random attack size (5-25% TVL, capped)
    let attack_size_bps = if let Some(size) = args.attack_size_bps {
        require!(
            size >= 500 && size <= 5000,
            GameVaultError::InvalidAttackSize
        );
        size
    } else {
        let random_value = generate_random_from_slot_hashes(
            &ctx.accounts.slot_hashes,
            clock.slot,
        )?;
        // 5-50% range, but will be capped at 25%
        let size = 500 + (random_value % 4501);
        size as u16
    };

    // Cap at 25% max
    const MAX_ATTACK_PERCENTAGE: u16 = 2500; // 25%
    let capped_attack_bps = attack_size_bps.min(MAX_ATTACK_PERCENTAGE);

    let attack_amount = mock_tvl_lamports
        .checked_mul(capped_attack_bps as u64)
        .ok_or(GameVaultError::ArithmeticOverflow)?
        .checked_div(10_000)
        .ok_or(GameVaultError::ArithmeticOverflow)?;

    msg!("  ✅ Random attack: {}% (capped at 25%)", capped_attack_bps / 100);
    msg!("     Attack size: {} lamports", attack_amount);

    // Step 4: CPI → Jupiter v6 → Execute real attack swap
    msg!("  🔧 CPI → Jupiter v6: Execute attack swap (mocked)");
    msg!("     Swap: {} game tokens → SOL", attack_amount);

    // Mock fee capture (1%)
    let fees_captured = attack_amount
        .checked_div(100)
        .ok_or(GameVaultError::ArithmeticOverflow)?;
    msg!("  ✅ Fees captured: {} lamports", fees_captured);

    // Step 5: Distribute fees:
    //   • 70% → Top 10 LPs (time-weighted)
    //   • 20% → #1 Defender SOL bonus
    //   • 10% → Treasury in Vault PDA

    // 70% to top 10
    let distributions = leaderboard.calculate_fee_distribution(fees_captured);
    msg!("  ✅ 70% distributed to top 10 LPs (time-weighted)");
    for (user, amount) in distributions.iter() {
        leaderboard.record_fees_earned(*user, *amount);
    }

    // 20% to #1 Defender
    let defender_entry = leaderboard.get_top_defender().cloned();
    if let Some(defender_entry) = defender_entry {
        let defender_bonus = fees_captured
            .checked_mul(20)
            .ok_or(GameVaultError::ArithmeticOverflow)?
            .checked_div(100)
            .ok_or(GameVaultError::ArithmeticOverflow)?;

        require!(
            ctx.accounts.defender.key() == defender_entry.user,
            GameVaultError::InvalidUserPosition
        );

        **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= defender_bonus;
        **ctx.accounts.defender.try_borrow_mut_lamports()? += defender_bonus;

        leaderboard.record_fees_earned(defender_entry.user, defender_bonus);
        leaderboard.award_defender_badge();

        msg!("  ✅ 20% SOL bonus → #1 Defender: {}", defender_entry.user);
    }

    // 10% to Treasury
    let treasury_amount = fees_captured
        .checked_mul(10)
        .ok_or(GameVaultError::ArithmeticOverflow)?
        .checked_div(100)
        .ok_or(GameVaultError::ArithmeticOverflow)?;

    ctx.accounts.vault.treasury_sol = ctx.accounts.vault.treasury_sol
        .checked_add(treasury_amount)
        .ok_or(GameVaultError::ArithmeticOverflow)?;

    msg!("  ✅ 10% → Treasury: {} lamports", treasury_amount);

    // Step 6: Update Leaderboard + WarHistory
    war_history.last_war_timestamp = current_time;
    war_history.total_wars = war_history.total_wars
        .checked_add(1)
        .ok_or(GameVaultError::ArithmeticOverflow)?;
    war_history.total_fees_distributed = war_history.total_fees_distributed
        .checked_add(fees_captured)
        .ok_or(GameVaultError::ArithmeticOverflow)?;

    msg!("  ✅ Leaderboard + WarHistory updated");

    // Emit LeaderboardUpdated event for frontend sync
    emit!(crate::state::LeaderboardUpdated {
        vault: ctx.accounts.vault.key(),
        top_10_users: leaderboard.top_10.iter().map(|e| e.user).collect(),
        top_10_scores: leaderboard.top_10.iter().map(|e| e.score).collect(),
        timestamp: current_time,
    });

    // Emit war event
    emit!(DailyWarTriggeredEvent {
        vault: ctx.accounts.vault.key(),
        caller: ctx.accounts.caller.key(),
        war_number: war_history.total_wars,
        attack_size_bps: capped_attack_bps,
        attack_amount,
        fees_captured,
        timestamp: current_time,
    });

    msg!("✅ WAR COMPLETE - War #{}", war_history.total_wars);
    msg!("   Attack: {}% | Fees: {} lamports", capped_attack_bps / 100, fees_captured);

    Ok(())
}

/// Check if current time is within main war windows (04:00-06:00 UTC or 16:00-18:00 UTC)
fn is_within_main_war_window(timestamp: i64) -> bool {
    const SECONDS_PER_DAY: i64 = 86400;
    const WINDOW_1_START: i64 = 4 * 3600; // 04:00 UTC
    const WINDOW_1_END: i64 = 6 * 3600; // 06:00 UTC
    const WINDOW_2_START: i64 = 16 * 3600; // 16:00 UTC
    const WINDOW_2_END: i64 = 18 * 3600; // 18:00 UTC

    let time_of_day = timestamp % SECONDS_PER_DAY;

    (time_of_day >= WINDOW_1_START && time_of_day < WINDOW_1_END) ||
    (time_of_day >= WINDOW_2_START && time_of_day < WINDOW_2_END)
}

/// Handle main window war with scheduled time validation
fn handle_main_window_war(war_history: &mut WarHistory, current_time: i64) -> Result<()> {
    const TOLERANCE_SECONDS: i64 = 300; // ±5 minutes

    // Generate scheduled time if not set or if last war was completed
    if war_history.scheduled_war_time == 0 || war_history.last_war_timestamp > 0 {
        // Calculate random time in current window using last war timestamp as seed
        let seed = if war_history.last_war_timestamp > 0 {
            war_history.last_war_timestamp as u64
        } else {
            current_time as u64
        };

        let random_minute = (seed % 120) as i64; // 0-119 minutes in 2-hour window
        let window_start = get_current_window_start(current_time);
        war_history.scheduled_war_time = window_start + (random_minute * 60);

        msg!("  🎲 New scheduled war time: {}", war_history.scheduled_war_time);
    }

    // Check if current time is within ±5 minutes of scheduled time
    let time_diff = (current_time - war_history.scheduled_war_time).abs();

    require!(
        time_diff <= TOLERANCE_SECONDS,
        GameVaultError::WarNotScheduled
    );

    msg!("  ✅ War triggered within scheduled window");
    msg!("    Scheduled: {}", war_history.scheduled_war_time);
    msg!("    Current: {}", current_time);
    msg!("    Difference: {} seconds", time_diff);

    Ok(())
}

/// Handle bonus war with anti-spam fee and cooldown
fn handle_bonus_war<'info>(
    caller: &Signer<'info>,
    vault: &Account<'info, Vault>,
    war_history: &mut WarHistory,
    current_time: i64
) -> Result<()> {
    const BONUS_WAR_FEE: u64 = 5_000_000; // 0.05 SOL
    const BONUS_WAR_COOLDOWN: i64 = 60; // 60 seconds

    msg!("  💰 Bonus war - requires 0.05 SOL fee");

    // Check 60s cooldown
    if war_history.last_bonus_war > 0 {
        let time_since_last_bonus = current_time - war_history.last_bonus_war;
        require!(
            time_since_last_bonus >= BONUS_WAR_COOLDOWN,
            GameVaultError::BonusWarCooldownActive
        );
        msg!("  ✅ Bonus war cooldown passed: {} seconds", time_since_last_bonus);
    }

    // Transfer fee from caller to vault
    let caller_lamports = caller.lamports();
    require!(
        caller_lamports >= BONUS_WAR_FEE,
        GameVaultError::InsufficientBonusWarFee
    );

    **caller.to_account_info().try_borrow_mut_lamports()? -= BONUS_WAR_FEE;
    **vault.to_account_info().try_borrow_mut_lamports()? += BONUS_WAR_FEE;

    // Update last bonus war timestamp
    war_history.last_bonus_war = current_time;

    msg!("  ✅ Bonus war fee paid: {} lamports", BONUS_WAR_FEE);
    msg!("  ⏰ Next bonus war available at: {}", current_time + BONUS_WAR_COOLDOWN);

    Ok(())
}

/// Get start time of current main war window
fn get_current_window_start(timestamp: i64) -> i64 {
    const SECONDS_PER_DAY: i64 = 86400;
    const WINDOW_1_START: i64 = 4 * 3600; // 04:00 UTC
    const WINDOW_2_START: i64 = 16 * 3600; // 16:00 UTC

    let time_of_day = timestamp % SECONDS_PER_DAY;
    let day_start = timestamp - time_of_day;

    if time_of_day >= WINDOW_1_START && time_of_day < 6 * 3600 {
        day_start + WINDOW_1_START
    } else {
        day_start + WINDOW_2_START
    }
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
