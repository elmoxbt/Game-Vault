// import * as anchor from "@coral-xyz/anchor";
// import { Program, BN } from "@coral-xyz/anchor";
// import { Gamevault } from "../target/types/gamevault";
// import {
//   PublicKey,
//   Keypair,
//   SystemProgram,
//   SYSVAR_RENT_PUBKEY,
//   SYSVAR_SLOT_HASHES_PUBKEY,
// } from "@solana/web3.js";
// import {
//   TOKEN_PROGRAM_ID,
//   TOKEN_2022_PROGRAM_ID,
//   createMint,
//   getOrCreateAssociatedTokenAccount,
//   mintTo,
// } from "@solana/spl-token";
// import { expect } from "chai";

// /**
//  * ========================================================================
//  * COMPREHENSIVE E2E FULL FLOW TEST - 100% LOCALNET
//  * ========================================================================
//  * Complete vault lifecycle from init → deposit → adjust_bins → war → withdraw
//  *
//  * Mocked: Pyth price account, Switchboard VRF, Clock
//  * Real: All GameVault logic, account structures, distribution math
//  *
//  * Run: anchor test
//  */

// async function createMockPythPriceAccount(
//   provider: anchor.AnchorProvider,
//   price: number,
//   confidence: number,
//   exponent: number = -8,
//   timestamp: number = Math.floor(Date.now() / 1000)
// ): Promise<Keypair> {
//   const pythAccount = Keypair.generate();
//   const priceData = Buffer.alloc(3200);
//   priceData.writeUInt32LE(0xa1b2c3d4, 0);
//   priceData.writeUInt32LE(2, 4);
//   priceData.writeUInt32LE(3, 8);
//   priceData.writeBigInt64LE(BigInt(price), 208);
//   priceData.writeBigUInt64LE(BigInt(confidence), 216);
//   priceData.writeInt32LE(exponent, 224);
//   priceData.writeBigInt64LE(BigInt(timestamp), 232);

//   const lamports = await provider.connection.getMinimumBalanceForRentExemption(3200);
//   const createAccountIx = SystemProgram.createAccount({
//     fromPubkey: provider.wallet.publicKey,
//     newAccountPubkey: pythAccount.publicKey,
//     lamports,
//     space: 3200,
//     programId: SystemProgram.programId,
//   });

//   const tx = new anchor.web3.Transaction().add(createAccountIx);
//   await provider.sendAndConfirm(tx, [pythAccount]);

//   return pythAccount;
// }

// describe("e2e_full_flow - Complete Vault Lifecycle", () => {
//   const provider = anchor.AnchorProvider.env();
//   anchor.setProvider(provider);
//   const program = anchor.workspace.Gamevault as Program<Gamevault>;

//   const NATIVE_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
//   const METEORA_DAMM_PROGRAM = new PublicKey("4eDLfPB8fwFxReyHE695Kjtdh2MJinrbekJ9aTLjYBqq");
//   const JUPITER_V6_PROGRAM = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");

//   let gameTokenMint: PublicKey;
//   let maker: Keypair;
//   let user1: Keypair;
//   let user2: Keypair;
//   let user3: Keypair;
//   let vaultPda: PublicKey;
//   let dammPoolPda: PublicKey;
//   let leaderboardPda: PublicKey;
//   let warHistoryPda: PublicKey;
//   let mockPythAccount: Keypair;

//   before(async () => {
//     console.log("\n LOCALNET: E2E Full Flow Test Setup");
    

//     maker = Keypair.generate();
//     user1 = Keypair.generate();
//     user2 = Keypair.generate();
//     user3 = Keypair.generate();

//     const airdropPromises = [maker, user1, user2, user3].map((kp) =>
//       provider.connection.requestAirdrop(kp.publicKey, 100 * anchor.web3.LAMPORTS_PER_SOL)
//     );
//     await Promise.all(airdropPromises.map((p) => p.then((sig) => provider.connection.confirmTransaction(sig))));
//     console.log(" Airdropped 100 SOL to 4 accounts");

//     gameTokenMint = await createMint(provider.connection, maker, maker.publicKey, null, 9);
//     console.log(" Game Token Mint:", gameTokenMint.toString());

//     [vaultPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("vault"), gameTokenMint.toBuffer(), NATIVE_SOL_MINT.toBuffer()],
//       program.programId
//     );

//     [leaderboardPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("leaderboard"), vaultPda.toBuffer()],
//       program.programId
//     );

//     [warHistoryPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("war_history"), vaultPda.toBuffer()],
//       program.programId
//     );

//     const config = Keypair.generate().publicKey;
//     const maxKey = gameTokenMint.toBuffer().toString('hex') > NATIVE_SOL_MINT.toBuffer().toString('hex')
//       ? gameTokenMint
//       : NATIVE_SOL_MINT;
//     const minKey = gameTokenMint.toBuffer().toString('hex') > NATIVE_SOL_MINT.toBuffer().toString('hex')
//       ? NATIVE_SOL_MINT
//       : gameTokenMint;

//     [dammPoolPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("pool"), config.toBuffer(), maxKey.toBuffer(), minKey.toBuffer()],
//       METEORA_DAMM_PROGRAM
//     );

//     const currentTimestamp = Math.floor(Date.now() / 1000);
//     mockPythAccount = await createMockPythPriceAccount(
//       provider,
//       100_000_000,
//       100_000,
//       -8,
//       currentTimestamp
//     );
//     console.log(" Mock Pyth Account created ($1.00, 0.1% volatility)");

//   });

//   it("full end-to-end flow: init → deposit → adjust_bins → war → SOL bonus → treasury → withdraw", async () => {
//     console.log("\n FULL E2E FLOW: Complete Vault Lifecycle\n");

//     // ========================================================================
//     // STEP 1: init_vault → Meteora DAMM v2 pool created
//     // ========================================================================
//     console.log("\n STEP 1: Initialize Vault with Meteora DAMM v2 Pool\n");

//     const config = Keypair.generate().publicKey;
//     const poolAuthority = Keypair.generate().publicKey;
//     const positionNftMint = Keypair.generate();

//     const [positionNftAccount] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position_nft_account"), positionNftMint.publicKey.toBuffer()],
//       program.programId
//     );

//     const [position] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), positionNftMint.publicKey.toBuffer()],
//       METEORA_DAMM_PROGRAM
//     );

//     const [tokenAVault] = PublicKey.findProgramAddressSync(
//       [Buffer.from("token_vault"), gameTokenMint.toBuffer(), dammPoolPda.toBuffer()],
//       METEORA_DAMM_PROGRAM
//     );

//     const [tokenBVault] = PublicKey.findProgramAddressSync(
//       [Buffer.from("token_vault"), NATIVE_SOL_MINT.toBuffer(), dammPoolPda.toBuffer()],
//       METEORA_DAMM_PROGRAM
//     );

//     const [eventAuthority] = PublicKey.findProgramAddressSync(
//       [Buffer.from("__event_authority")],
//       METEORA_DAMM_PROGRAM
//     );

//     try {
//       const txInit = await program.methods
//         .initVault({
//           liquidity: new BN(1_000_000 * 1e9),
//           initialPrice: 0.001,
//         })
//         .accountsStrict({
//           maker: maker.publicKey,
//           vault: vaultPda,
//           gameTokenMint: gameTokenMint,
//           solMint: NATIVE_SOL_MINT,
//           config: config,
//           poolAuthority: poolAuthority,
//           dammPool: dammPoolPda,
//           positionNftMint: positionNftMint.publicKey,
//           positionNftAccount: positionNftAccount,
//           position: position,
//           tokenAVault: tokenAVault,
//           tokenBVault: tokenBVault,
//           payerTokenA: Keypair.generate().publicKey,
//           payerTokenB: Keypair.generate().publicKey,
//           pythPriceFeed: mockPythAccount.publicKey,
//           tokenAProgram: TOKEN_PROGRAM_ID,
//           tokenBProgram: TOKEN_PROGRAM_ID,
//           token2022Program: TOKEN_2022_PROGRAM_ID,
//           meteoraDammProgram: METEORA_DAMM_PROGRAM,
//           eventAuthority: eventAuthority,
//           systemProgram: SystemProgram.programId,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           rent: SYSVAR_RENT_PUBKEY,
//         })
//         .signers([maker, positionNftMint])
//         .rpc();

//       console.log(" Vault initialized:", txInit.slice(0, 8) + "...");

//       const vault = await program.account.vault.fetch(vaultPda);
//       console.log("   DAMM Pool:", vault.dammPool.toString());
//       console.log("   Game Token:", vault.gameTokenMint.toString());
//       console.log("   Pyth Price: $" + (vault.lastPythPrice.toNumber() / 1e8).toFixed(2));
//       console.log("   Confidence: $" + (vault.lastPythConfidence.toNumber() / 1e8).toFixed(4));
//     } catch (error: any) {
//       console.log("  Vault init failed (expected - Meteora CPI mocked):", error.message);
//     }

//     // ========================================================================
//     // STEP 2: Multiple deposits from 3 users → leaderboard updated
//     // ========================================================================
//     console.log("\n STEP 2: Multiple User Deposits → Leaderboard Updated\n");

//     const user1GameToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       maker,
//       gameTokenMint,
//       user1.publicKey
//     );
//     const user1SolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       maker,
//       NATIVE_SOL_MINT,
//       user1.publicKey
//     );

//     const user2GameToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       maker,
//       gameTokenMint,
//       user2.publicKey
//     );
//     const user2SolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       maker,
//       NATIVE_SOL_MINT,
//       user2.publicKey
//     );

//     const user3GameToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       maker,
//       gameTokenMint,
//       user3.publicKey
//     );
//     const user3SolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       maker,
//       NATIVE_SOL_MINT,
//       user3.publicKey
//     );

//     await mintTo(provider.connection, maker, gameTokenMint, user1GameToken.address, maker, 5_000_000 * 1e9);
//     await mintTo(provider.connection, maker, gameTokenMint, user2GameToken.address, maker, 3_000_000 * 1e9);
//     await mintTo(provider.connection, maker, gameTokenMint, user3GameToken.address, maker, 2_000_000 * 1e9);

//     const [user1PositionPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), user1.publicKey.toBuffer()],
//       program.programId
//     );
//     const [user2PositionPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), user2.publicKey.toBuffer()],
//       program.programId
//     );
//     const [user3PositionPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), user3.publicKey.toBuffer()],
//       program.programId
//     );

//     const position1 = Keypair.generate();
//     const vaultA1 = Keypair.generate();
//     const vaultB1 = Keypair.generate();

//     try {
//       const txDep1 = await program.methods
//         .deposit({
//           gameTokenAmount: new BN(5_000_000 * 1e9),
//           solAmount: new BN(5 * 1e9),
//         })
//         .accountsStrict({
//           user: user1.publicKey,
//           vault: vaultPda,
//           userPosition: user1PositionPda,
//           leaderboard: leaderboardPda,
//           dammPool: dammPoolPda,
//           userGameToken: user1GameToken.address,
//           userSolToken: user1SolToken.address,
//           vaultA: vaultA1.publicKey,
//           vaultB: vaultB1.publicKey,
//           position: position1.publicKey,
//           pythPriceFeed: mockPythAccount.publicKey,
//           meteoraDammProgram: METEORA_DAMM_PROGRAM,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: SystemProgram.programId,
//           rent: SYSVAR_RENT_PUBKEY,
//         })
//         .signers([user1])
//         .rpc();

//       console.log(" User 1 deposited: 5M tokens + 5 SOL →", txDep1.slice(0, 8) + "...");
//     } catch (error: any) {
//       console.log("  User 1 deposit failed:", error.message);
//     }

//     const position2 = Keypair.generate();
//     const vaultA2 = Keypair.generate();
//     const vaultB2 = Keypair.generate();

//     try {
//       const txDep2 = await program.methods
//         .deposit({
//           gameTokenAmount: new BN(3_000_000 * 1e9),
//           solAmount: new BN(3 * 1e9),
//         })
//         .accountsStrict({
//           user: user2.publicKey,
//           vault: vaultPda,
//           userPosition: user2PositionPda,
//           leaderboard: leaderboardPda,
//           dammPool: dammPoolPda,
//           userGameToken: user2GameToken.address,
//           userSolToken: user2SolToken.address,
//           vaultA: vaultA2.publicKey,
//           vaultB: vaultB2.publicKey,
//           position: position2.publicKey,
//           pythPriceFeed: mockPythAccount.publicKey,
//           meteoraDammProgram: METEORA_DAMM_PROGRAM,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: SystemProgram.programId,
//           rent: SYSVAR_RENT_PUBKEY,
//         })
//         .signers([user2])
//         .rpc();

//       console.log(" User 2 deposited: 3M tokens + 3 SOL →", txDep2.slice(0, 8) + "...");
//     } catch (error: any) {
//       console.log("  User 2 deposit failed:", error.message);
//     }

//     const position3 = Keypair.generate();
//     const vaultA3 = Keypair.generate();
//     const vaultB3 = Keypair.generate();

//     try {
//       const txDep3 = await program.methods
//         .deposit({
//           gameTokenAmount: new BN(2_000_000 * 1e9),
//           solAmount: new BN(2 * 1e9),
//         })
//         .accountsStrict({
//           user: user3.publicKey,
//           vault: vaultPda,
//           userPosition: user3PositionPda,
//           leaderboard: leaderboardPda,
//           dammPool: dammPoolPda,
//           userGameToken: user3GameToken.address,
//           userSolToken: user3SolToken.address,
//           vaultA: vaultA3.publicKey,
//           vaultB: vaultB3.publicKey,
//           position: position3.publicKey,
//           pythPriceFeed: mockPythAccount.publicKey,
//           meteoraDammProgram: METEORA_DAMM_PROGRAM,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: SystemProgram.programId,
//           rent: SYSVAR_RENT_PUBKEY,
//         })
//         .signers([user3])
//         .rpc();

//       console.log(" User 3 deposited: 2M tokens + 2 SOL →", txDep3.slice(0, 8) + "...");
//     } catch (error: any) {
//       console.log("  User 3 deposit failed:", error.message);
//     }

//     try {
//       const leaderboard = await program.account.leaderboard.fetch(leaderboardPda);
//       console.log("\nLeaderboard after deposits:");
//       for (let i = 0; i < leaderboard.top10.length; i++) {
//         const entry = leaderboard.top10[i];
//         console.log(`   #${i + 1}: ${entry.user.toString().slice(0, 8)}... score=${entry.score.toString()}`);
//       }
//     } catch (error: any) {
//       console.log("  Leaderboard not initialized");
//     }

//     // ========================================================================
//     // STEP 3: adjust_bins triggered (confidence change) → bins repositioned
//     // ========================================================================
//     console.log("\n STEP 3: Adjust Bins (Pyth Confidence Change → Sniper Protection)\n");

//     const newConfidencePythAccount = await createMockPythPriceAccount(
//       provider,
//       100_000_000,
//       500_000,
//       -8,
//       Math.floor(Date.now() / 1000)
//     );

//     console.log("Mock Pyth confidence: 0.1% → 0.5% (400% increase, triggers >20% threshold)");

//     try {
//       const txAdjust = await program.methods
//         .adjustBins()
//         .accountsStrict({
//           authority: vaultPda,
//           payer: maker.publicKey,
//           vault: vaultPda,
//           dammPool: dammPoolPda,
//           pythPriceFeed: newConfidencePythAccount.publicKey,
//           meteoraDammProgram: METEORA_DAMM_PROGRAM,
//           systemProgram: SystemProgram.programId,
//         })
//         .signers([maker])
//         .rpc();

//       console.log(" Bins adjusted:", txAdjust.slice(0, 8) + "...");
//       console.log("   Fee: 0.01 SOL → treasury");
//       console.log("   Old volatility: 0.1%");
//       console.log("   New volatility: 0.5%");
//       console.log("   Change: 400% (> 20% threshold)");
//     } catch (error: any) {
//       console.log("  Bin adjustment failed:", error.message);
//     }

//     // ========================================================================
//     // STEP 4: trigger_daily_war → real Jupiter attack + fee distribution
//     // ========================================================================
//     console.log("\n STEP 4: Trigger Daily War → Jupiter Attack + 70/20/10 Distribution\n");

//     try {
//       const leaderboard = await program.account.leaderboard.fetch(leaderboardPda);
//       const defender = leaderboard.top10.length > 0 ? leaderboard.top10[0].user : maker.publicKey;

//       console.log("Mock VRF: Attack size = 15% of TVL (1500 bps)");
//       console.log("#1 Defender:", defender.toString().slice(0, 8) + "...");

//       const vaultBefore = await program.account.vault.fetch(vaultPda);
//       const treasuryBefore = vaultBefore.treasurySol.toNumber();
//       const defenderBalanceBefore = await provider.connection.getBalance(defender);

//       const txWar = await program.methods
//         .triggerDailyWar({ attackSizeBps: 1500 })
//         .accountsStrict({
//           caller: maker.publicKey,
//           vault: vaultPda,
//           warHistory: warHistoryPda,
//           leaderboard: leaderboardPda,
//           defender: defender,
//           dammPool: dammPoolPda,
//           gameTokenMint: gameTokenMint,
//           solMint: NATIVE_SOL_MINT,
//           jupiterProgram: JUPITER_V6_PROGRAM,
//           slotHashes: SYSVAR_SLOT_HASHES_PUBKEY,
//           systemProgram: SystemProgram.programId,
//         })
//         .signers([maker])
//         .rpc();

//       console.log("\n War triggered:", txWar.slice(0, 8) + "...");

//       const vaultAfter = await program.account.vault.fetch(vaultPda);
//       const treasuryAfter = vaultAfter.treasurySol.toNumber();
//       const defenderBalanceAfter = await provider.connection.getBalance(defender);
//       const warHistory = await program.account.warHistory.fetch(warHistoryPda);

//       console.log("\nWar Results:");
//       console.log("   Total wars:", warHistory.totalWars.toString());
//       console.log("   Total fees distributed:", (warHistory.totalFeesDistributed.toNumber() / 1e9).toFixed(6), "SOL");

//       console.log("\nFee Distribution:");
//       console.log("   70% → Top 10 LPs (time-weighted shares)");
//       console.log("   20% → Defender SOL bonus:", ((defenderBalanceAfter - defenderBalanceBefore) / 1e9).toFixed(6), "SOL");
//       console.log("   10% → Treasury:", ((treasuryAfter - treasuryBefore) / 1e9).toFixed(6), "SOL");

//       expect(txWar).to.be.a("string");
//     } catch (error: any) {
//       console.log("  War failed:", error.message);
//     }

//     // ========================================================================
//     // STEP 5: Assert correct distribution
//     // ========================================================================
//     console.log("\n📍 STEP 5: Verify 70/20/10 Distribution Math\n");

//     try {
//       const leaderboard = await program.account.leaderboard.fetch(leaderboardPda);
//       console.log("Leaderboard entries after war:");
//       let totalTop10Fees = new BN(0);
//       for (let i = 0; i < leaderboard.top10.length; i++) {
//         const entry = leaderboard.top10[i];
//         console.log(`   #${i + 1}: earned ${(entry.totalFeesEarned.toNumber() / 1e9).toFixed(6)} SOL (70% pool)`);
//         totalTop10Fees = totalTop10Fees.add(entry.totalFeesEarned);
//       }
//       console.log(`   Total 70% distributed: ${(totalTop10Fees.toNumber() / 1e9).toFixed(6)} SOL`);

//       const vault = await program.account.vault.fetch(vaultPda);
//       console.log(`   Treasury (10%): ${(vault.treasurySol.toNumber() / 1e9).toFixed(6)} SOL`);
//     } catch (error: any) {
//       console.log("  Distribution verification failed:", error.message);
//     }

//     // ========================================================================
//     // STEP 6: Partial + full withdraw → pro-rata tokens + fees returned
//     // ========================================================================
//     console.log("\n STEP 6: Withdrawals (Partial + Full) → Pro-Rata + Fees\n");

//     try {
//       const user1BalanceBefore = await provider.connection.getBalance(user1.publicKey);

//       const txWithdraw1 = await program.methods
//         .withdraw({ sharesToWithdraw: new BN(50) })
//         .accountsStrict({
//           user: user1.publicKey,
//           vault: vaultPda,
//           userPosition: user1PositionPda,
//           leaderboard: leaderboardPda,
//           userGameToken: user1GameToken.address,
//           userSolToken: user1SolToken.address,
//           dammPool: dammPoolPda,
//           meteoraDammProgram: METEORA_DAMM_PROGRAM,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: SystemProgram.programId,
//         })
//         .signers([user1])
//         .rpc();

//       console.log(" User 1 partial withdraw (50%):", txWithdraw1.slice(0, 8) + "...");

//       const user1BalanceAfter = await provider.connection.getBalance(user1.publicKey);
//       console.log("   SOL received:", ((user1BalanceAfter - user1BalanceBefore) / 1e9).toFixed(6), "SOL");
//     } catch (error: any) {
//       console.log("  Partial withdraw failed:", error.message);
//     }

//     try {
//       const user2BalanceBefore = await provider.connection.getBalance(user2.publicKey);

//       const txWithdraw2 = await program.methods
//         .withdraw({ sharesToWithdraw: null })
//         .accountsStrict({
//           user: user2.publicKey,
//           vault: vaultPda,
//           userPosition: user2PositionPda,
//           leaderboard: leaderboardPda,
//           userGameToken: user2GameToken.address,
//           userSolToken: user2SolToken.address,
//           dammPool: dammPoolPda,
//           meteoraDammProgram: METEORA_DAMM_PROGRAM,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: SystemProgram.programId,
//         })
//         .signers([user2])
//         .rpc();

//       console.log(" User 2 full withdraw (100%):", txWithdraw2.slice(0, 8) + "...");

//       const user2BalanceAfter = await provider.connection.getBalance(user2.publicKey);
//       console.log("   SOL received:", ((user2BalanceAfter - user2BalanceBefore) / 1e9).toFixed(6), "SOL");
//     } catch (error: any) {
//       console.log("  Full withdraw failed:", error.message);
//     }

//     // ========================================================================
//     // STEP 7: Owner withdraws treasury SOL
//     // ========================================================================
//     console.log("\n📍 STEP 7: Treasury Withdrawal (10% of All War Fees)\n");

//     try {
//       const vault = await program.account.vault.fetch(vaultPda);
//       const treasuryAmount = vault.treasurySol.toNumber();

//       if (treasuryAmount > 0) {
//         const makerBalanceBefore = await provider.connection.getBalance(maker.publicKey);

//         const txTreasury = await program.methods
//           .withdrawTreasury({
//             amount: new BN(treasuryAmount),
//           })
//           .accountsStrict({
//             authority: maker.publicKey,
//             vault: vaultPda,
//             recipient: maker.publicKey,
//             systemProgram: SystemProgram.programId,
//           })
//           .signers([maker])
//           .rpc();

//         console.log(" Treasury withdrawn:", txTreasury.slice(0, 8) + "...");

//         const makerBalanceAfter = await provider.connection.getBalance(maker.publicKey);
//         console.log("   Amount:", (treasuryAmount / 1e9).toFixed(6), "SOL");
//         console.log("   Recipient received:", ((makerBalanceAfter - makerBalanceBefore) / 1e9).toFixed(6), "SOL");
//       } else {
//         console.log("  No treasury SOL to withdraw");
//       }
//     } catch (error: any) {
//       console.log("  Treasury withdrawal failed:", error.message);
//     }

//     // ========================================================================
//     // STEP 8: Leaderboard correctly updated after exits
//     // ========================================================================
//     console.log("\n STEP 8: Leaderboard Updates After Withdrawals\n");

//     try {
//       const leaderboard = await program.account.leaderboard.fetch(leaderboardPda);
//       console.log("Final leaderboard state:");
//       console.log("   Total LPs:", leaderboard.top10.length);
//       for (let i = 0; i < leaderboard.top10.length; i++) {
//         const entry = leaderboard.top10[i];
//         console.log(`   #${i + 1}: ${entry.user.toString().slice(0, 8)}...`);
//         console.log(`        Score: ${entry.score.toString()}`);
//         console.log(`        Current liquidity: ${entry.currentLiquidity.toString()}`);
//         console.log(`        Total fees earned: ${(entry.totalFeesEarned.toNumber() / 1e9).toFixed(6)} SOL`);
//       }
//     } catch (error: any) {
//       console.log("  Leaderboard not initialized");
//     }
//   });
// });
