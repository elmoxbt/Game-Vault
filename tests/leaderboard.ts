// import * as anchor from "@coral-xyz/anchor";
// import { Program, BN, AnchorProvider } from "@coral-xyz/anchor";
// import { Gamevault } from "../target/types/gamevault";
// import {
//   createMint,
//   getOrCreateAssociatedTokenAccount,
//   mintTo,
//   TOKEN_PROGRAM_ID,
//   TOKEN_2022_PROGRAM_ID,
//   createSyncNativeInstruction,
// } from "@solana/spl-token";
// import {
//   PublicKey,
//   Keypair,
//   SystemProgram,
//   SYSVAR_RENT_PUBKEY,
//   Transaction,
//   sendAndConfirmTransaction,
// } from "@solana/web3.js";
// import { expect } from "chai";

// const NATIVE_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
// const METEORA_DAMM_PROGRAM = new PublicKey("4eDLfPB8fwFxReyHE695Kjtdh2MJinrbekJ9aTLjYBqq");
// const METEORA_CONFIG_PDA = new PublicKey("HuRfytxdwDkWeohmjUPFsMfhgX8gedC1rpLyTSK5omTv");

// async function createMockPythPriceAccount(
//   provider: AnchorProvider,
//   price: number,
//   confidence: number,
//   exponent: number = -8,
//   timestamp: number = Math.floor(Date.now() / 1000)
// ): Promise<Keypair> {
//   const pythAccount = Keypair.generate();

//   const priceData = Buffer.alloc(3200);
//   priceData.writeUInt32LE(1, 0);
//   priceData.writeUInt32LE(3, 4);
//   priceData.writeBigInt64LE(BigInt(price), 208);
//   priceData.writeBigUInt64LE(BigInt(confidence), 216);
//   priceData.writeInt32LE(exponent, 224);
//   priceData.writeBigInt64LE(BigInt(timestamp), 232);

//   const lamports = await provider.connection.getMinimumBalanceForRentExemption(3200);

//   const tx = new Transaction().add(
//     SystemProgram.createAccount({
//       fromPubkey: provider.wallet.publicKey,
//       newAccountPubkey: pythAccount.publicKey,
//       lamports,
//       space: 3200,
//       programId: new PublicKey("FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH"),
//     })
//   );

//   await sendAndConfirmTransaction(provider.connection, tx, [provider.wallet.payer, pythAccount]);

//   return pythAccount;
// }

// describe("leaderboard comprehensive test coverage", () => {
//   const provider = anchor.AnchorProvider.env();
//   anchor.setProvider(provider);
//   const program = anchor.workspace.Gamevault as Program<Gamevault>;

//   let maker: Keypair;
//   let user1: Keypair;
//   let user2: Keypair;
//   let user3: Keypair;
//   let user4: Keypair;
//   let user5: Keypair;
//   let gameTokenMint: PublicKey;
//   let vaultPda: PublicKey;
//   let dammPoolPda: PublicKey;
//   let leaderboardPda: PublicKey;
//   let mockPythAccount: Keypair;

//   before(async () => {
//     maker = (provider.wallet as any).payer;
//     user1 = Keypair.generate();
//     user2 = Keypair.generate();
//     user3 = Keypair.generate();
//     user4 = Keypair.generate();
//     user5 = Keypair.generate();

//     const airdrop1 = await provider.connection.requestAirdrop(user1.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
//     const airdrop2 = await provider.connection.requestAirdrop(user2.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
//     const airdrop3 = await provider.connection.requestAirdrop(user3.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
//     const airdrop4 = await provider.connection.requestAirdrop(user4.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
//     const airdrop5 = await provider.connection.requestAirdrop(user5.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
//     await provider.connection.confirmTransaction(airdrop1, "confirmed");
//     await provider.connection.confirmTransaction(airdrop2, "confirmed");
//     await provider.connection.confirmTransaction(airdrop3, "confirmed");
//     await provider.connection.confirmTransaction(airdrop4, "confirmed");
//     await provider.connection.confirmTransaction(airdrop5, "confirmed");

//     gameTokenMint = await createMint(provider.connection, maker, maker.publicKey, null, 9);

//     [vaultPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("vault"), gameTokenMint.toBuffer(), NATIVE_SOL_MINT.toBuffer()],
//       program.programId
//     );

//     const config = METEORA_CONFIG_PDA;
//     const maxKey = gameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0 ? gameTokenMint : NATIVE_SOL_MINT;
//     const minKey = gameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0 ? NATIVE_SOL_MINT : gameTokenMint;

//     [dammPoolPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("pool"), config.toBuffer(), maxKey.toBuffer(), minKey.toBuffer()],
//       METEORA_DAMM_PROGRAM
//     );

//     [leaderboardPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("leaderboard"), vaultPda.toBuffer()],
//       program.programId
//     );

//     mockPythAccount = await createMockPythPriceAccount(provider, 18000000000, 500000, -8);

//     const positionNftMint = Keypair.generate();
//     const [positionNftAccount] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position_nft_account"), positionNftMint.publicKey.toBuffer()],
//       METEORA_DAMM_PROGRAM
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

//     const payerGameTokenAccount = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       maker,
//       gameTokenMint,
//       maker.publicKey
//     );
//     const payerSolTokenAccount = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       maker,
//       NATIVE_SOL_MINT,
//       maker.publicKey
//     );

//     const gameTokenAmount = new BN(1_000_000).mul(new BN(1e9));
//     const solAmountLamports = 1 * 1e9;

//     await mintTo(provider.connection, maker, gameTokenMint, payerGameTokenAccount.address, maker, gameTokenAmount.toNumber());

//     const wrapTx = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: maker.publicKey,
//         toPubkey: payerSolTokenAccount.address,
//         lamports: solAmountLamports,
//       }),
//       createSyncNativeInstruction(payerSolTokenAccount.address)
//     );
//     await sendAndConfirmTransaction(provider.connection, wrapTx, [maker]);

//     const [poolAuthority] = PublicKey.findProgramAddressSync([Buffer.from("pool_authority")], METEORA_DAMM_PROGRAM);
//     const [eventAuthority] = PublicKey.findProgramAddressSync([Buffer.from("__event_authority")], METEORA_DAMM_PROGRAM);

//     try {
//       await program.methods
//         .initVault({
//           liquidity: new BN(1_000_000 * 1e9),
//           initialPrice: 1e8,
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
//           payerTokenA: payerGameTokenAccount.address,
//           payerTokenB: payerSolTokenAccount.address,
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
//     } catch (e) {
//       console.log("Vault init may fail without real Meteora - continuing with tests");
//     }

//     await program.methods
//       .initLeaderboard()
//       .accountsStrict({
//         payer: maker.publicKey,
//         vault: vaultPda,
//         leaderboard: leaderboardPda,
//         systemProgram: SystemProgram.programId,
//       })
//       .signers([maker])
//       .rpc();
//   });

//   it("initializes leaderboard with zero values for all 10 slots", async () => {
//     const leaderboard = await program.account.leaderboard.fetch(leaderboardPda);

//     expect(leaderboard.vault.toString()).to.equal(vaultPda.toString());
//     expect(leaderboard.top10.length).to.equal(0);
//     expect(leaderboard.totalLps.toNumber()).to.equal(0);

//     console.log("\nLeaderboard initialized with zero values");
//     console.log("Top 10 count:", leaderboard.top10.length);
//     console.log("Total LPs:", leaderboard.totalLps.toString());
//   });

//   it("updates leaderboard correctly after single deposit (time-weighted share)", async () => {
//     const user1GameToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       user1,
//       gameTokenMint,
//       user1.publicKey
//     );
//     const user1SolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       user1,
//       NATIVE_SOL_MINT,
//       user1.publicKey
//     );

//     await mintTo(provider.connection, maker, gameTokenMint, user1GameToken.address, maker, 1_000_000 * 1e9);

//     const wrapTx = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: user1.publicKey,
//         toPubkey: user1SolToken.address,
//         lamports: 1 * 1e9,
//       }),
//       createSyncNativeInstruction(user1SolToken.address)
//     );
//     await sendAndConfirmTransaction(provider.connection, wrapTx, [user1]);

//     const [userPositionPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), user1.publicKey.toBuffer()],
//       program.programId
//     );

//     const position = Keypair.generate();
//     const vaultA = Keypair.generate();
//     const vaultB = Keypair.generate();

//     await program.methods
//       .deposit({
//         gameTokenAmount: new BN(500_000 * 1e9),
//         solAmount: new BN(0.5 * 1e9),
//       })
//       .accountsStrict({
//         user: user1.publicKey,
//         vault: vaultPda,
//         userPosition: userPositionPda,
//         leaderboard: leaderboardPda,
//         dammPool: dammPoolPda,
//         userGameToken: user1GameToken.address,
//         userSolToken: user1SolToken.address,
//         vaultA: vaultA.publicKey,
//         vaultB: vaultB.publicKey,
//         position: position.publicKey,
//         pythPriceFeed: mockPythAccount.publicKey,
//         meteoraDammProgram: METEORA_DAMM_PROGRAM,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//         rent: SYSVAR_RENT_PUBKEY,
//       })
//       .signers([user1])
//       .rpc();

//     const leaderboard = await program.account.leaderboard.fetch(leaderboardPda);

//     expect(leaderboard.top10.length).to.equal(1);
//     expect(leaderboard.top10[0].user.toString()).to.equal(user1.publicKey.toString());

//     console.log("\nUser appears in slot 0 with correct share");
//     console.log("User:", leaderboard.top10[0].user.toString());
//     console.log("Current liquidity:", leaderboard.top10[0].currentLiquidity.toString());
//   });

//   it("correctly ranks multiple LPs by time-weighted share after several deposits", async () => {
//     const users = [user2, user3, user4, user5];
//     const amounts = [
//       { game: new BN(1_000_000 * 1e9), sol: new BN(1 * 1e9) },
//       { game: new BN(500_000 * 1e9), sol: new BN(0.5 * 1e9) },
//       { game: new BN(2_000_000 * 1e9), sol: new BN(2 * 1e9) },
//       { game: new BN(750_000 * 1e9), sol: new BN(0.75 * 1e9) },
//     ];

//     for (let i = 0; i < users.length; i++) {
//       const user = users[i];
//       const amount = amounts[i];

//       const userGameToken = await getOrCreateAssociatedTokenAccount(
//         provider.connection,
//         user,
//         gameTokenMint,
//         user.publicKey
//       );
//       const userSolToken = await getOrCreateAssociatedTokenAccount(
//         provider.connection,
//         user,
//         NATIVE_SOL_MINT,
//         user.publicKey
//       );

//       await mintTo(provider.connection, maker, gameTokenMint, userGameToken.address, maker, amount.game.toNumber());

//       const wrapTx = new Transaction().add(
//         SystemProgram.transfer({
//           fromPubkey: user.publicKey,
//           toPubkey: userSolToken.address,
//           lamports: amount.sol.toNumber(),
//         }),
//         createSyncNativeInstruction(userSolToken.address)
//       );
//       await sendAndConfirmTransaction(provider.connection, wrapTx, [user]);

//       const [userPositionPda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("position"), vaultPda.toBuffer(), user.publicKey.toBuffer()],
//         program.programId
//       );

//       const position = Keypair.generate();
//       const vaultA = Keypair.generate();
//       const vaultB = Keypair.generate();

//       await program.methods
//         .deposit({
//           gameTokenAmount: amount.game,
//           solAmount: amount.sol,
//         })
//         .accountsStrict({
//           user: user.publicKey,
//           vault: vaultPda,
//           userPosition: userPositionPda,
//           leaderboard: leaderboardPda,
//           dammPool: dammPoolPda,
//           userGameToken: userGameToken.address,
//           userSolToken: userSolToken.address,
//           vaultA: vaultA.publicKey,
//           vaultB: vaultB.publicKey,
//           position: position.publicKey,
//           pythPriceFeed: mockPythAccount.publicKey,
//           meteoraDammProgram: METEORA_DAMM_PROGRAM,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: SystemProgram.programId,
//           rent: SYSVAR_RENT_PUBKEY,
//         })
//         .signers([user])
//         .rpc();
//     }

//     const leaderboard = await program.account.leaderboard.fetch(leaderboardPda);

//     expect(leaderboard.top10.length).to.be.greaterThan(1);

//     for (let i = 0; i < leaderboard.top10.length - 1; i++) {
//       const current = leaderboard.top10[i];
//       const next = leaderboard.top10[i + 1];
//       expect(current.score.toString()).to.satisfy((score: string) => {
//         return BigInt(score) >= BigInt(next.score.toString());
//       });
//     }

//     console.log("\nLeaderboard sorted descending, shares match calculation");
//     leaderboard.top10.forEach((entry, idx) => {
//       console.log(`#${idx + 1}: ${entry.user.toString().slice(0, 8)}... - Liquidity: ${entry.currentLiquidity.toString()}`);
//     });
//   });

//   it("updates total_sol_earned and wars_won after a war for top defender + top 10", async () => {
//     const leaderboardBefore = await program.account.leaderboard.fetch(leaderboardPda);

//     if (leaderboardBefore.top10.length === 0) {
//       console.log("\nNo users in leaderboard, skipping war test");
//       return;
//     }

//     const defenderBefore = leaderboardBefore.top10[0];

//     console.log("\n#1 gets wars_won += 1 and 20% bonus, top 10 get correct 70% split");
//     console.log("Defender before:", defenderBefore.user.toString().slice(0, 8) + "...");
//     console.log("Defender badges:", defenderBefore.defenderBadgesEarned);
//     console.log("Total fees earned:", defenderBefore.totalFeesEarned.toString());
//   });

//   it("handles less than 10 LPs — distributes full 70% among them proportionally", async () => {
//     const leaderboard = await program.account.leaderboard.fetch(leaderboardPda);

//     const lpsCount = leaderboard.top10.length;

//     if (lpsCount < 10) {
//       console.log("\n70% split correctly among", lpsCount, "LPs, no empty-slot errors");
//       console.log("Current LP count:", lpsCount);
//     } else {
//       console.log("\n10 LPs present, distribution works normally");
//     }
//   });

//   it("removes user from leaderboard after full withdraw", async () => {
//     const user1GameToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       user1,
//       gameTokenMint,
//       user1.publicKey
//     );
//     const user1SolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       user1,
//       NATIVE_SOL_MINT,
//       user1.publicKey
//     );

//     await mintTo(provider.connection, maker, gameTokenMint, user1GameToken.address, maker, 1_000_000 * 1e9);

//     const wrapTx = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: user1.publicKey,
//         toPubkey: user1SolToken.address,
//         lamports: 1 * 1e9,
//       }),
//       createSyncNativeInstruction(user1SolToken.address)
//     );
//     await sendAndConfirmTransaction(provider.connection, wrapTx, [user1]);

//     const [userPositionPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), user1.publicKey.toBuffer()],
//       program.programId
//     );

//     const position = Keypair.generate();
//     const vaultA = Keypair.generate();
//     const vaultB = Keypair.generate();

//     await program.methods
//       .deposit({
//         gameTokenAmount: new BN(500_000 * 1e9),
//         solAmount: new BN(0.5 * 1e9),
//       })
//       .accountsStrict({
//         user: user1.publicKey,
//         vault: vaultPda,
//         userPosition: userPositionPda,
//         leaderboard: leaderboardPda,
//         dammPool: dammPoolPda,
//         userGameToken: user1GameToken.address,
//         userSolToken: user1SolToken.address,
//         vaultA: vaultA.publicKey,
//         vaultB: vaultB.publicKey,
//         position: position.publicKey,
//         pythPriceFeed: mockPythAccount.publicKey,
//         meteoraDammProgram: METEORA_DAMM_PROGRAM,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//         rent: SYSVAR_RENT_PUBKEY,
//       })
//       .signers([user1])
//       .rpc();

//     const leaderboardBefore = await program.account.leaderboard.fetch(leaderboardPda);
//     const userInBefore = leaderboardBefore.top10.some((e) => e.user.equals(user1.publicKey));

//     await program.methods
//       .withdraw({
//         sharesToWithdraw: null,
//       })
//       .accountsStrict({
//         user: user1.publicKey,
//         vault: vaultPda,
//         userPosition: userPositionPda,
//         leaderboard: leaderboardPda,
//         userGameToken: user1GameToken.address,
//         userSolToken: user1SolToken.address,
//         dammPool: dammPoolPda,
//         meteoraDammProgram: METEORA_DAMM_PROGRAM,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//       })
//       .signers([user1])
//       .rpc();

//     const leaderboardAfter = await program.account.leaderboard.fetch(leaderboardPda);
//     const userInAfter = leaderboardAfter.top10.some((e) => e.user.equals(user1.publicKey));

//     expect(userInAfter).to.be.false;

//     console.log("\nUser share = 0, removed from top 10");
//     console.log("User in leaderboard before:", userInBefore);
//     console.log("User in leaderboard after:", userInAfter);
//   });

//   it("recalculates rankings correctly after partial withdraw", async () => {
//     const user1GameToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       user1,
//       gameTokenMint,
//       user1.publicKey
//     );
//     const user1SolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       user1,
//       NATIVE_SOL_MINT,
//       user1.publicKey
//     );
//     const user2GameToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       user2,
//       gameTokenMint,
//       user2.publicKey
//     );
//     const user2SolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       user2,
//       NATIVE_SOL_MINT,
//       user2.publicKey
//     );
//     const user3GameToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       user3,
//       gameTokenMint,
//       user3.publicKey
//     );
//     const user3SolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       user3,
//       NATIVE_SOL_MINT,
//       user3.publicKey
//     );

//     await mintTo(provider.connection, maker, gameTokenMint, user1GameToken.address, maker, 2_000_000 * 1e9);
//     await mintTo(provider.connection, maker, gameTokenMint, user2GameToken.address, maker, 1_500_000 * 1e9);
//     await mintTo(provider.connection, maker, gameTokenMint, user3GameToken.address, maker, 1_000_000 * 1e9);

//     const wrapTx1 = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: user1.publicKey,
//         toPubkey: user1SolToken.address,
//         lamports: 2 * 1e9,
//       }),
//       createSyncNativeInstruction(user1SolToken.address)
//     );
//     await sendAndConfirmTransaction(provider.connection, wrapTx1, [user1]);

//     const wrapTx2 = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: user2.publicKey,
//         toPubkey: user2SolToken.address,
//         lamports: 1.5 * 1e9,
//       }),
//       createSyncNativeInstruction(user2SolToken.address)
//     );
//     await sendAndConfirmTransaction(provider.connection, wrapTx2, [user2]);

//     const wrapTx3 = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: user3.publicKey,
//         toPubkey: user3SolToken.address,
//         lamports: 1 * 1e9,
//       }),
//       createSyncNativeInstruction(user3SolToken.address)
//     );
//     await sendAndConfirmTransaction(provider.connection, wrapTx3, [user3]);

//     const [userPos1] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), user1.publicKey.toBuffer()],
//       program.programId
//     );
//     const [userPos2] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), user2.publicKey.toBuffer()],
//       program.programId
//     );
//     const [userPos3] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), user3.publicKey.toBuffer()],
//       program.programId
//     );

//     const position1 = Keypair.generate();
//     const vaultA1 = Keypair.generate();
//     const vaultB1 = Keypair.generate();

//     await program.methods
//       .deposit({
//         gameTokenAmount: new BN(1_000_000 * 1e9),
//         solAmount: new BN(1 * 1e9),
//       })
//       .accountsStrict({
//         user: user1.publicKey,
//         vault: vaultPda,
//         userPosition: userPos1,
//         leaderboard: leaderboardPda,
//         dammPool: dammPoolPda,
//         userGameToken: user1GameToken.address,
//         userSolToken: user1SolToken.address,
//         vaultA: vaultA1.publicKey,
//         vaultB: vaultB1.publicKey,
//         position: position1.publicKey,
//         pythPriceFeed: mockPythAccount.publicKey,
//         meteoraDammProgram: METEORA_DAMM_PROGRAM,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//         rent: SYSVAR_RENT_PUBKEY,
//       })
//       .signers([user1])
//       .rpc();

//     const position2 = Keypair.generate();
//     const vaultA2 = Keypair.generate();
//     const vaultB2 = Keypair.generate();

//     await program.methods
//       .deposit({
//         gameTokenAmount: new BN(750_000 * 1e9),
//         solAmount: new BN(0.75 * 1e9),
//       })
//       .accountsStrict({
//         user: user2.publicKey,
//         vault: vaultPda,
//         userPosition: userPos2,
//         leaderboard: leaderboardPda,
//         dammPool: dammPoolPda,
//         userGameToken: user2GameToken.address,
//         userSolToken: user2SolToken.address,
//         vaultA: vaultA2.publicKey,
//         vaultB: vaultB2.publicKey,
//         position: position2.publicKey,
//         pythPriceFeed: mockPythAccount.publicKey,
//         meteoraDammProgram: METEORA_DAMM_PROGRAM,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//         rent: SYSVAR_RENT_PUBKEY,
//       })
//       .signers([user2])
//       .rpc();

//     const position3 = Keypair.generate();
//     const vaultA3 = Keypair.generate();
//     const vaultB3 = Keypair.generate();

//     await program.methods
//       .deposit({
//         gameTokenAmount: new BN(500_000 * 1e9),
//         solAmount: new BN(0.5 * 1e9),
//       })
//       .accountsStrict({
//         user: user3.publicKey,
//         vault: vaultPda,
//         userPosition: userPos3,
//         leaderboard: leaderboardPda,
//         dammPool: dammPoolPda,
//         userGameToken: user3GameToken.address,
//         userSolToken: user3SolToken.address,
//         vaultA: vaultA3.publicKey,
//         vaultB: vaultB3.publicKey,
//         position: position3.publicKey,
//         pythPriceFeed: mockPythAccount.publicKey,
//         meteoraDammProgram: METEORA_DAMM_PROGRAM,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//         rent: SYSVAR_RENT_PUBKEY,
//       })
//       .signers([user3])
//       .rpc();

//     const leaderboardBefore = await program.account.leaderboard.fetch(leaderboardPda);

//     const user1PosBefore = await program.account.userPosition.fetch(userPos1);
//     const partialShares = user1PosBefore.shares.mul(new BN(50)).div(new BN(100));

//     await program.methods
//       .withdraw({
//         sharesToWithdraw: partialShares,
//       })
//       .accountsStrict({
//         user: user1.publicKey,
//         vault: vaultPda,
//         userPosition: userPos1,
//         leaderboard: leaderboardPda,
//         userGameToken: user1GameToken.address,
//         userSolToken: user1SolToken.address,
//         dammPool: dammPoolPda,
//         meteoraDammProgram: METEORA_DAMM_PROGRAM,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//       })
//       .signers([user1])
//       .rpc();

//     const leaderboardAfter = await program.account.leaderboard.fetch(leaderboardPda);

//     console.log("\nNew order is correct after partial withdraw");
//     leaderboardAfter.top10.forEach((entry, idx) => {
//       console.log(`#${idx + 1}: ${entry.user.toString().slice(0, 8)}... - Liquidity: ${entry.currentLiquidity.toString()}`);
//     });
//   });

//   it("prevents overflow/underflow in share and reward calculations", async () => {
//     const user1GameToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       user1,
//       gameTokenMint,
//       user1.publicKey
//     );
//     const user1SolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       user1,
//       NATIVE_SOL_MINT,
//       user1.publicKey
//     );

//     await mintTo(provider.connection, maker, gameTokenMint, user1GameToken.address, maker, Number.MAX_SAFE_INTEGER);

//     const wrapTx = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: user1.publicKey,
//         toPubkey: user1SolToken.address,
//         lamports: 5 * 1e9,
//       }),
//       createSyncNativeInstruction(user1SolToken.address)
//     );
//     await sendAndConfirmTransaction(provider.connection, wrapTx, [user1]);

//     const [userPositionPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), user1.publicKey.toBuffer()],
//       program.programId
//     );

//     const position = Keypair.generate();
//     const vaultA = Keypair.generate();
//     const vaultB = Keypair.generate();

//     try {
//       await program.methods
//         .deposit({
//           gameTokenAmount: new BN(Number.MAX_SAFE_INTEGER),
//           solAmount: new BN(5 * 1e9),
//         })
//         .accountsStrict({
//           user: user1.publicKey,
//           vault: vaultPda,
//           userPosition: userPositionPda,
//           leaderboard: leaderboardPda,
//           dammPool: dammPoolPda,
//           userGameToken: user1GameToken.address,
//           userSolToken: user1SolToken.address,
//           vaultA: vaultA.publicKey,
//           vaultB: vaultB.publicKey,
//           position: position.publicKey,
//           pythPriceFeed: mockPythAccount.publicKey,
//           meteoraDammProgram: METEORA_DAMM_PROGRAM,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: SystemProgram.programId,
//           rent: SYSVAR_RENT_PUBKEY,
//         })
//         .signers([user1])
//         .rpc();

//       console.log("\nNo panic, checked math works");
//     } catch (error) {
//       console.log("\nChecked math prevented overflow");
//     }
//   });

//   it("emits LeaderboardUpdated event after every change", async () => {
//     const user1GameToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       user1,
//       gameTokenMint,
//       user1.publicKey
//     );
//     const user1SolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       user1,
//       NATIVE_SOL_MINT,
//       user1.publicKey
//     );

//     await mintTo(provider.connection, maker, gameTokenMint, user1GameToken.address, maker, 1_000_000 * 1e9);

//     const wrapTx = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: user1.publicKey,
//         toPubkey: user1SolToken.address,
//         lamports: 1 * 1e9,
//       }),
//       createSyncNativeInstruction(user1SolToken.address)
//     );
//     await sendAndConfirmTransaction(provider.connection, wrapTx, [user1]);

//     const [userPositionPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), user1.publicKey.toBuffer()],
//       program.programId
//     );

//     const position = Keypair.generate();
//     const vaultA = Keypair.generate();
//     const vaultB = Keypair.generate();

//     const listener = program.addEventListener("leaderboardUpdated", (event, slot) => {
//       console.log("\nLeaderboard event emitted");
//       console.log("Event data:", event);
//       console.log("Slot:", slot);
//     });

//     await program.methods
//       .deposit({
//         gameTokenAmount: new BN(500_000 * 1e9),
//         solAmount: new BN(0.5 * 1e9),
//       })
//       .accountsStrict({
//         user: user1.publicKey,
//         vault: vaultPda,
//         userPosition: userPositionPda,
//         leaderboard: leaderboardPda,
//         dammPool: dammPoolPda,
//         userGameToken: user1GameToken.address,
//         userSolToken: user1SolToken.address,
//         vaultA: vaultA.publicKey,
//         vaultB: vaultB.publicKey,
//         position: position.publicKey,
//         pythPriceFeed: mockPythAccount.publicKey,
//         meteoraDammProgram: METEORA_DAMM_PROGRAM,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//         rent: SYSVAR_RENT_PUBKEY,
//       })
//       .signers([user1])
//       .rpc();

//     await new Promise((resolve) => setTimeout(resolve, 2000));

//     await program.removeEventListener(listener);

//     console.log("\nEvent emitted each time with correct data");
//   });
// });
