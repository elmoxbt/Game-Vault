# GameVault — On-Chain Sniper-Proof Liquidity Vault for Solana Games

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

## 1. init_vault — Create the DAMM v2 Pool

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

## 2. deposit — Add Liquidity with Smart Bins

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

## 3. adjust_bins — Auto-Protect Against Volatility

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

## 4. trigger_daily_war — Liquidity Wars (Daily Event)

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

## 5. withdraw — Pro-Rata Exit

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

---

**All logic on-chain — zero off-chain bots**
**DAMM v2 + Pyth = automatic sniper resistance**
**Liquidity Wars = addictive daily yield game**

GameVault doesn't just protect liquidity — it turns defense into the most engaging on-chain game in the ecosystem.

## Tech Stack

### Current (Day 2)
- **Anchor 0.30.1** - Smart contract framework
- **anchor-spl 0.30.1** - SPL token integration
- **Meteora CP-AMM DAMM v2** - Self-contained integration (CPIs mocked)
  - Program ID: `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`
  - Reference: Cloned repo at `./meteora-cp-amm/`
- **Pyth Oracle** - Price + volatility (mocked: $1.00, $0.01 confidence)

### Planned (Day 3+)
- Real Meteora CP-AMM CPI integration
- Real Pyth oracle integration
- Switchboard VRF (randomness)
- Jupiter v6 (swaps)
- Metaplex Bubblegum (NFT badges)

---

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

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

**Hackathon:** Solana Student Hackathon Fall 2025 (14-day build)

Devnet Program: `[will update after first deploy]`
