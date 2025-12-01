# GameVault

**The first on-chain sniper-resistant dynamic liquidity vault for Solana gaming economies**

## What It Does
GameVault uses Meteora DAMM v2 + Pyth oracles to automatically protect game token liquidity from bot attacks, while turning defense into a daily competitive game via "Liquidity Wars".

## Architecture
[Overall Title: GameVault Protocol Architecture]
[Blue Border - High-Level Overview]
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ GameVault Program (Anchor/Rust) ── Integrations: Meteora DAMM v2 (CPI), Pyth Oracle (Pull),      │
│ Switchboard VRF (Randomness), Jupiter (Swaps), Metaplex (NFT Badges) ── State: PDAs for Vaults,  │
│ Leaderboards, War History ── Users: Game Devs (Init/Deposit), Players (Wars/Withdraw)            │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘

[Panel 1: Blue Border - Vault Initialization Instruction]
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Create Vault Instruction (init_vault)                                                           │
│                                                                                                 │
│ [Maker (Game Dev Signer)] ──[Create Vault Request]───> [Vault Instruction] ──[CPI to DAMM]───>   │
│   │                                                                    │                       │
│   │ [Vault PDA Account] (Seeds: [game_token, program_id])               │                       │
│   │                                                                    │                       │
│   ↓                                                                    │                       │
│ [Initial Liquidity Deposit] (Tokens to Vault) ──[Check SOL > 0]───> [Decision Diamond]         │
│                                                                    │ Yes │                    │
│                                                                    │     │                    │
│                                                                    │     │ [DAMM Pool Created] │
│                                                                    │     │ (Bin Arrays, Fees)  │
│ [No] ──[Transaction Fails] <─────────────────────────────────────────┘     │                    │
│                                                                    │     │                    │
│                                                                    │     │ [Pyth Price Fetch] ──[Store Initial Price/Vol] ──> [Vault Ready] │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘

[Panel 2: Purple Border - Deposit & Liquidity Allocation Instruction]
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Deposit Instruction (deposit)                                                                   │
│                                                                                                 │
│ [User (LP Signer)] ──[Deposit Request]───> [Deposit Instruction] ──[CPI to SPL Token]───>       │
│   │                                                                    │                       │
│   │ [User's Token Account] (ATA)                                      │                       │
│   │                                                                    │                       │
│   ↓                                                                    │                       │
│ [Transfer Tokens to Vault PDA] ──[Validate Amount > Min]───> [Decision Diamond]                 │
│                                                                    │ Yes │                    │
│                                                                    │     │                    │
│                                                                    │     │ [Pyth Pull Oracle] ──[Get Price + Confidence Interval] ──> [Calculate Optimal Bins] │
│ [No] ──[Transaction Reverts] <───────────────────────────────────────┘     │                    │
│                                                                    │     │                    │
│                                                                    │     │ [CPI to DAMM: Add Liquidity to Bins] ──> [Position NFT Minted (User Share)] │
│                                                                    │     │                    │
│                                                                    │     │ [Update Leaderboard PDA (Time-Weighted Share)]                          │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘

[Panel 3: Orange Border - Bin Adjustment (Auto-Protection) Instruction]
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Adjust Bins Instruction (adjust_bins) - Triggered on Deposit or Cron                            │
│                                                                                                 │
│ [Vault Authority (Program)] ──[Adjustment Trigger]───> [Adjust Instruction] ──[CPI to DAMM]───> │
│   │                                                                    │                        │
│   │ [Vault PDA Account] (Current Bins/Vol Data)                        │                        │
│   │                                                                    │                        │
│   ↓                                                                    │                        │
│ [Pyth Oracle Pull] ──[Fetch Latest Price/Confidence]───> [Decision Diamond]                     │
│                                                                    │ Vol Spike? │               │
│                                                                    │ (Conf > Threshold) │       │
│ [Staleness Check Fail] ──[Revert] <─────────────────────────────────── No ──> [No Change]       │
│                                                                    │     │                      │  
│                                                                    │     │ [Calculate New Bin Range] (e.g., ±Vol*2) │
│                                                                    │     │                    │
│                                                                    │ Yes │                    │
│                                                                    │     │ [CPI to DAMM: Remove Old Liquidity] ──> [Add to New Bins] ──> [Vault Updated] │
│                                                                    │     │                    │
│                                                                    │     │ [Emit Event for Frontend Sync]                                      │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘

[Panel 4: Green Border - Liquidity Wars & Withdraw Instruction]
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Liquidity Wars (trigger_daily_war) + Withdraw (withdraw)                                       │
│                                                                                                 │
│ [Anyone (Trigger Signer)] ──[War Trigger (Post-Cooldown)]───> [War Instruction] ──[CPI to VRF]──>│
│   │                                                                    │                       │
│   │ [War History PDA] (Last 24h Check)                                 │                       │
│   │                                                                    │                       │
│   ↓                                                                    │                       │
│ [Switchboard VRF Randomness] ──[Generate Attack Size (5-50%)]───> [Decision Diamond]           │
│                                                                    │ Cooldown OK? │            │   
│ [No] ──[Revert] <───────────────────────────────────────────────────── No ──> [Fail Tx]        │
│                                                                    │     │                     │
│                                                                    │ Yes │                     │
│                                                                    │     │ [CPI to Jupiter: Execute Attack Swap] ──> [Measure Slippage Absorbed] │
│                                                                    │     │                    │
│                                                                    │     │ [Distribute Fees: Top 10 LPs (70%) + Defender NFT] ──> [Update Leaderboard] │
│                                                                    │     │                    │
│ [Withdraw Flow] ──[User Request]───> [Pro-Rata Shares + Accrued] ──[CPI to SPL]───> [Tokens Out] │
│                                                                    │     │ [Cleanup PDAs if Empty]                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘

[Footer Notes]
- Arrows: Solid = Data Flow; Dashed = Optional CPI; Red = Failure Paths
- Shapes: Rectangles = Accounts/Instructions; Diamonds = Decisions
- Colors: Simulated borders match original (Blue=Init, Purple=Deposit, Orange=Adjust, Green=Wars/Withdraw)
- Total Instructions: 5 (Modular, ~600 LOC in Anchor)
- Deployment: Solana Devnet; Frontend: React + Wallet Adapter for UX

## Tech Stack
- Anchor 0.31.1
- Meteora DAMM v2 SDK
- Pyth Pull Oracles
- Switchboard VRF
- Jupiter v6
- Metaplex Bubblegum

## Status
🚧 Day 0 - Initial scaffolding (Solana Student Hackathon Fall 2025)

## Setup
```bash
anchor build
anchor test
```

Devnet Program: `[will update after first deploy]`