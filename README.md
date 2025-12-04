# GameVault —> 
## On-Chain Sniper-Proof Liquidity Vault for Solana Games

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│ GameVault Program (Anchor/Rust)                                     │
│                                                                     │
│ Integrates:                                                         │
│  • Meteora DAMM v2 (CPI)                                            │
│  • Pyth Pull Oracle (price + confidence)                            │
│  • Switchboard VRF (randomness)                                     │
│  • Jupiter v6 (attack swaps)                                        │
│  • Metaplex Bubblegum (compressed Defender NFT)                     │
│                                                                     │
│ State (PDAs): Vault • Config • Leaderboard • WarHistory             │
└─────────────────────────────────────────────────────────────────────┘
```

## 1. init_vault - Create the DAMM v2 Pool

```
[Game Dev] ──► init_vault
                │
                ▼
        Create Vault PDA (seed: [game_token, program_id])
                │
                ▼
        CPI → Meteora DAMM v2: InitializePool
                │
                ▼
        Pyth Pull → Store initial price + confidence
                │
                ▼
        Vault Ready (dynamic fees, single-sided enabled)
```

## 2. deposit - Add Liquidity with Smart Bins

```
[LP] ──► deposit
          │
          ▼
  Transfer tokens → Vault PDA
          │
          ▼
  Pyth Pull → Get price + confidence interval
          │
          ▼
  Calculate optimal bin range (± confidence × factor)
          │
          ▼
  CPI → DAMM v2: AddLiquidity (to calculated bins)
          │
          ▼
  Mint Position NFT (user's share) + Update Leaderboard
```

## 3. adjust_bins - Auto-Protect Against Volatility

```
Anyone (or cron) ──► adjust_bins
                     │
                     ▼
             Pyth Pull → Latest price + confidence
                     │
          Confidence change > 20% ?
               ┌── No ──► No change
               ▼
              Yes
               │
               ▼
  CPI → DAMM v2: Remove liquidity from old bins
               │
               ▼
  CPI → DAMM v2: Add liquidity to new wider/narrower bins
               │
               ▼
  Emit BinsAdjusted event (frontend sync)
```

## 4. trigger_daily_war - Liquidity Wars (Daily Event)

```
Anyone ──► trigger_daily_war
            │
            ▼
    24h cooldown passed?
      ┌── No ──► Revert
      ▼
     Yes
      │
      ▼
Switchboard VRF → Random attack size (5–50 % TVL)
      │
      ▼
CPI → Jupiter v6 → Execute real attack swap
      │
      ▼
Capture fees generated
      │
      ▼
Distribute:
   • 70 % → Top 10 LPs (time-weighted)
   • 30 % → #1 Defender gets compressed NFT badge (Bubblegum)
      │
      ▼
Update Leaderboard + WarHistory PDA
```

## 5. withdraw - Pro-Rata Exit

```
[LP] ──► withdraw
          │
          ▼
Calculate pro-rata share + accrued fees
          │
          ▼
CPI → DAMM v2: RemoveLiquidity
          │
          ▼
Transfer tokens back to user
          │
          ▼
Burn position NFT share + update Leaderboard
```

**All logic on-chain - zero off-chain bots**
**DAMM v2 + Pyth = automatic sniper resistance**
**Liquidity Wars = addictive daily yield game**

GameVault doesn't just protect liquidity - it turns defense into the most engaging on-chain game in the ecosystem.

## Tech Stack

### Current (Day 3)
- **Anchor 0.30.1** - Smart contract framework
- **anchor-spl 0.30.1** - SPL token integration
- **Meteora CP-AMM DAMM v2** - Self-contained integration (CPIs mocked)
  - Program ID: `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`
  - Reference: Cloned repo at `./meteora-cp-amm/`
- **Pyth Oracle** - Price + volatility (mocked: $1.00, $0.01 confidence)

### Planned (Day 4+)
- Real Meteora CP-AMM CPI integration
- Real Pyth oracle integration
- Switchboard VRF (randomness)
- Jupiter v6 (swaps)
- Metaplex Bubblegum (NFT badges)

## Status

### ✅ Day 1 - Core Foundation
- Vault initialization with DAMM v2 pool creation
- State accounts: Vault, UserPosition, War, Leaderboard
- Tests passing: `init_vault`

### ✅ Day 2 - DAMM v2 + Pyth-Powered Deposits
- Deposit instruction with Pyth-powered optimal price range
- Volatility-based ranging: confidence to ±5%, ±15%, or ±30%
- Q64.64 sqrt_price conversions for CP-AMM
- UserPosition PDA initialization (first deposit only)
- Self-contained implementation (no external deps beyond Anchor)
- Tests passing: `init_vault`, `deposit`

### ✅ Day 3 - Auto Bin Adjustment (The Sniper Killer)
- **`adjust_bins` instruction** - Permissionless volatility-triggered rebalancing
- Compares new Pyth confidence vs stored volatility
- Triggers when volatility change >= 20%
- Removes liquidity from old bins, adds to new optimal range
- Emits `BinsAdjustedEvent` for frontend sync
- Added `last_bin_adjustment_timestamp` field to Vault
- Tests passing: `init_vault`, `deposit`, `adjust_bins`

**How It Protects:**
- Calm to Volatile (300% spike): Bins auto-widen from ±5% to ±15%
- Volatile to Calm (80% drop): Bins auto-tighten from ±30% to ±15%
- Sniper attacks during volatility automatically absorbed by wider ranges
- Anyone can trigger (decentralized protection)

### 🚧 Day 4+ - Real Integration + Liquidity Wars
- Add `add_to_position` instruction (subsequent deposits)
- Implement real Meteora CP-AMM CPI calls
- Implement real Pyth oracle integration
- Switchboard VRF integration
- Jupiter swap integration
- Daily war trigger mechanism
- Leaderboard + fee distribution

## Setup

```bash
# Build
anchor build --no-idl

# Generate IDL (run from program directory)
cd programs/gamevault
RUSTUP_TOOLCHAIN=nightly-2025-04-01 anchor idl build -o ../../target/idl/gamevault.json -t ../../target/types/gamevault.ts
cd ../..

# Test vault initialization
anchor test --skip-build -- --tests init_vault

# Test deposit (first deposit only)
anchor test --skip-build -- --tests deposit

# Test adjust_bins (sniper killer)
anchor test --skip-build -- --tests adjust_bins

# Run all tests
anchor test --skip-build

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

**Hackathon:** Solana Student Hackathon Fall 2025 (14-day build)

Devnet Program: `[will update after first deploy]`
