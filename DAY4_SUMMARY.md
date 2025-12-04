# Day 4 Summary: Liquidity Wars Core Engine

## What We Built

Implemented the **trigger_daily_war** instruction - the core engine for GameVault's Liquidity Wars feature. This permissionless instruction allows anyone to trigger a simulated attack swap every 24 hours, capturing fees and tracking war statistics.

## Key Features Implemented

### 1. War History PDA
- **Account**: `WarHistory` - Tracks all war statistics
- **Seeds**: `["war_history", vault]`
- **Fields**:
  - `vault`: Which vault this history tracks
  - `last_war_timestamp`: Enforces 24h cooldown
  - `total_wars`: Total number of wars executed
  - `total_fees_distributed`: Cumulative fees captured
  - `bump`: PDA bump seed

### 2. Trigger Daily War Instruction
- **Permissionless**: Anyone can call to trigger a war
- **24h Cooldown**: Enforced via `last_war_timestamp` check
- **Random Attack Size**: 5-50% of TVL (500-5000 bps)
  - Uses Solana slot hashes sysvar for randomness
  - Formula: `500 + (random_value % 4501)` bps
- **Mock Implementation** (Day 4):
  - TVL calculation mocked at 1000 SOL
  - Jupiter v6 CPI mocked
  - Fee capture: 1% of attack amount
- **Auto-initialization**: War history PDA created on first war

### 3. Error Handling
- **WarCooldownActive** (6002): Prevents wars before 24h elapsed
- **InvalidAttackSize** (6011): Validates attack size is 5-50%

### 4. Events
- **DailyWarTriggeredEvent**: Emitted on each war
  - vault, caller, war_number
  - attack_size_bps, attack_amount
  - fees_captured, timestamp

## Technical Implementation

### Manual PDA Initialization
To avoid Anchor 0.30.1's `init_if_needed` + `Bumps` trait issue, we:
1. Use `UncheckedAccount` for war_history
2. Manually check if account is empty
3. Create account via CPI to system program
4. Manually serialize/deserialize data

### Test Helper
Created `fetchWarHistory()` helper to manually deserialize the war history account since it's an `UncheckedAccount` and not in the IDL as a typed account.

## Tests Passing

1. **Initializes vault before war** ✅
2. **Triggers first daily war successfully** ✅
   - Verifies war history is created
   - Checks total_wars = 1
   - Confirms fees_captured > 0
3. **Fails to trigger war before 24h cooldown** ✅
   - Correctly rejects with error
4. **Validates attack size range** ✅
   - Correctly rejects 60% attack (> 50% max)
5. **Documents expected behavior** ✅
   - Explains randomness source
   - Documents attack size range
   - Shows fee calculation

## Files Created/Modified

### New Files
- `programs/gamevault/src/instructions/trigger_daily_war.rs`
- `tests/trigger_daily_war.ts`
- `DAY4_SUMMARY.md`

### Modified Files
- `programs/gamevault/src/instructions/mod.rs`
- `programs/gamevault/src/lib.rs`
- `programs/gamevault/src/error.rs` (added InvalidAttackSize)
- `programs/gamevault/src/state/war.rs` (simplified WarHistory struct)

## Day 4 vs Production

### Current (Mocked)
- TVL: Hardcoded 1000 SOL
- Jupiter swap: Logged only, no actual CPI
- Fee capture: Simple 1% calculation
- Randomness: Slot hashes (deterministic but sufficient)

### Future (Day 5+)
- TVL: Real calculation from Meteora pool
- Jupiter swap: Actual CPI to Jupiter v6 aggregator
- Fee capture: Real swap fees from Jupiter + Meteora
- Fee distribution: 70% to Top 10 LPs, 30% to #1 Defender
- Defender NFT: Metaplex Bubblegum compressed NFT mint

## Architecture Decisions

1. **Slot Hashes for Randomness**: Simpler than Switchboard VRF for Day 4, upgradeable later
2. **Manual PDA Management**: Avoids Anchor 0.30.1 limitations
3. **Permissionless Design**: Anyone can trigger, incentivized by potential rewards later
4. **Simple Fee Model**: 1% mock fee, will integrate real swap fees on Day 5

## Next Steps (Day 5)

1. **Fee Distribution Logic**
   - Implement Top 10 LP tracking
   - Calculate time-weighted positions
   - Distribute 70% of fees to Top 10
2. **Defender NFT Minting**
   - Integrate Metaplex Bubblegum
   - Mint compressed NFT for #1 defender
   - Award 30% of fees to winner
3. **Real Jupiter Integration**
   - Replace mock with actual Jupiter v6 CPI
   - Handle slippage and routing
4. **Real TVL Calculation**
   - Query Meteora pool for actual TVL
   - Calculate attack amount from live data

## Command to Run Tests

```bash
anchor test --skip-build -- --tests trigger_daily_war
```

## Result

Day 4 successfully implements the Liquidity Wars core engine with:
- ✅ 24h cooldown enforcement
- ✅ Random attack size generation (5-50%)
- ✅ Fee capture tracking
- ✅ War history statistics
- ✅ Permissionless triggering
- ✅ All tests passing

The foundation is ready for Day 5's fee distribution and NFT minting features.
