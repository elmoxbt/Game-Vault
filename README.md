# GameVault —>
## On-Chain Sniper-Proof Liquidity Vault for Solana Games

## User Story: GameVault – The Shield Every Solana Game Deserves

### Title
"As a Solana game studio launching a new token and in-game economy, I want my liquidity to be automatically protected from sniper bots and price crashes so that our community can trade fairly and the project survives the first 48 hours."

### Persona
**Name:** Maya
**Role:** Lead Developer & Tokenomics Designer at "Nexus Raiders" – an upcoming on-chain RPG built on Solana (compressed NFTs, play-to-earn mechanics, 50k pre-registered players).

### Context
It's launch week. Nexus Raiders is dropping its $RAID governance/utility token and opening the first NFT marketplace.

Maya has seen too many Solana game launches get destroyed in the opening minutes:
- Bots front-run the pool → 70–90% dumps
- TVL evaporates from $5M → $200k in hours
- Community rage-quits, Discord turns toxic, price never recovers

She's tired of choosing between:
- Fragile constant-product pools (easy to snipe)
- Expensive mercenary liquidity (VC dumps later)
- Manual bin management (impossible during launch chaos)

### The GameVault Moment
Maya discovers GameVault – a single-click, on-chain liquidity shield built for gaming tokens.

### What happens next (the user journey)

**1. One-Click Vault Creation**
- Maya connects her dev wallet, selects $RAID/SOL pair, deposits the initial 150,000 USDC + 3M $RAID tokens.
- GameVault instantly creates a Meteora DAMM v2 pool with Pyth-oracle-driven dynamic bins – no manual range setting.

**2. Automatic Sniper Defense**
Behind the scenes:
- Pyth confidence interval is used as a real-time volatility proxy
- Every few hours (or on large imbalance) the vault automatically widens or concentrates liquidity bins
- Result: even a 500 SOL coordinated dump results in <1.2% price impact instead of 60%+

**3. Liquidity Wars – The Addictive Daily Event**
Every 24 hours at 16:00 UTC the protocol triggers "Liquidity Wars":
- A random-size attack (5–40% of TVL) is executed on-chain using Jupiter routing
- All fees generated + a bonus from the reward pool are distributed instantly
- Top 10 LPs of the day split 70% of the war booty
- The single position that absorbed the most damage earns the "Defender of the Day" compressed NFT badge (updatable metadata, soulbound)

Maya watches the leaderboard refresh live. Her community starts competing daily to climb the ranks → organic, sticky liquidity that never leaves.

**4. Community Ownership & Virality**
Players and fans begin providing liquidity just to earn badges and daily payouts.

Twitter explodes with auto-generated tweets:
> "I just defended Nexus Raiders vault and earned 18 SOL in fees! Can you beat me tomorrow? #LiquidityWars"

**5. Long-Term Flywheel**
Three months later:
- TVL sits at $42M (instead of the usual post-launch bleed)
- Daily volume > $18M with <0.8% average slippage
- $RAID price is 4.2× launch price
- Maya never had to pay mercenary LPs or beg VCs for liquidity

### As a result…
Nexus Raiders survives launch week, retains its community, and becomes the case study every new Solana game studio copies.

### One-liner that Maya tweets after launch
> "GameVault turned our liquidity from a liability into a daily competitive game that prints yield and shields us from bots. Every Solana game needs this yesterday."

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

### Current (Day 4)
- **Anchor 0.30.1** - Smart contract framework
- **anchor-spl 0.30.1** - SPL token integration
- **Meteora CP-AMM DAMM v2** - Self-contained integration (CPIs mocked)
  - Program ID: `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`
  - Reference: Cloned repo at `./meteora-cp-amm/`
- **Pyth Oracle** - Price + volatility (mocked: $1.00, $0.01 confidence)
- **Jupiter v6** - Swap aggregator (mocked for Day 4)
  - Program ID: `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`
- **Slot Hashes Sysvar** - Randomness source for attack sizes

### Planned (Day 5+)
- Real Meteora CP-AMM CPI integration
- Real Pyth oracle integration
- Real Jupiter v6 CPI integration
- Switchboard VRF (optional: upgrade from slot hashes)
- Metaplex Bubblegum (NFT badges)
- Leaderboard + time-weighted LP tracking

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
- **[View Day 2 Summary](DAY2_SUMMARY.md)**

### ✅ Day 3 - Auto Bin Adjustment (The Sniper Killer)
- **`adjust_bins` instruction** - Permissionless volatility-triggered rebalancing
- Compares new Pyth confidence vs stored volatility
- Triggers when volatility change >= 20%
- Removes liquidity from old bins, adds to new optimal range
- Emits `BinsAdjustedEvent` for frontend sync
- Added `last_bin_adjustment_timestamp` field to Vault
- Tests passing: `init_vault`, `deposit`, `adjust_bins`
- **[View Day 3 Summary](DAY3_SUMMARY.md)**

**How It Protects:**
- Calm to Volatile (300% spike): Bins auto-widen from ±5% to ±15%
- Volatile to Calm (80% drop): Bins auto-tighten from ±30% to ±15%
- Sniper attacks during volatility automatically absorbed by wider ranges
- Anyone can trigger (decentralized protection)

### ✅ Day 4 - Liquidity Wars Core Engine
- **`trigger_daily_war` instruction** - Permissionless daily war trigger
- 24h cooldown enforcement via WarHistory PDA
- Random attack size generation (5-50% of TVL) using slot hashes
- Mock Jupiter v6 swap execution
- Fee capture tracking (1% mock fee)
- WarHistory PDA with manual initialization
- Tests passing: `init_vault`, `deposit`, `adjust_bins`, `trigger_daily_war`
- **[View Day 4 Summary](DAY4_SUMMARY.md)**

**What's Mocked (Day 4):**
- TVL calculation (hardcoded 1000 SOL)
- Jupiter v6 CPI (logged only)
- Fee capture (simple 1% calculation)

### 🚧 Day 5+ - Real Integration + Fee Distribution
- Implement real Meteora CP-AMM CPI calls
- Implement real Pyth oracle integration
- Real Jupiter v6 swap integration
- Fee distribution to Top 10 LPs (70%)
- Defender NFT minting via Metaplex Bubblegum (30%)
- Add `add_to_position` instruction (subsequent deposits)
- Leaderboard tracking and rewards

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

# Test trigger_daily_war (liquidity wars)
anchor test --skip-build -- --tests trigger_daily_war

# Run all tests
anchor test --skip-build

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

**Hackathon:** Solana Student Hackathon Fall 2025 (14-day build)

Devnet Program: `[will update after first deploy]`
