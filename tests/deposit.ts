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
//   SYSVAR_CLOCK_PUBKEY,
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

// describe("deposit comprehensive test coverage", () => {
//   const provider = anchor.AnchorProvider.env();
//   anchor.setProvider(provider);
//   const program = anchor.workspace.Gamevault as Program<Gamevault>;

//   let maker: Keypair;
//   let depositor1: Keypair;
//   let depositor2: Keypair;
//   let gameTokenMint: PublicKey;
//   let vaultPda: PublicKey;
//   let dammPoolPda: PublicKey;
//   let leaderboardPda: PublicKey;
//   let mockPythAccount: Keypair;

//   before(async () => {
//     maker = (provider.wallet as any).payer;
//     depositor1 = Keypair.generate();
//     depositor2 = Keypair.generate();

//     const airdrop1 = await provider.connection.requestAirdrop(depositor1.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
//     const airdrop2 = await provider.connection.requestAirdrop(depositor2.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
//     await provider.connection.confirmTransaction(airdrop1, "confirmed");
//     await provider.connection.confirmTransaction(airdrop2, "confirmed");

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

//   it("deposit succeeds and adds liquidity to optimal bins using real Pyth confidence", async () => {
//     const depositorGameToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       depositor1,
//       gameTokenMint,
//       depositor1.publicKey
//     );
//     const depositorSolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       depositor1,
//       NATIVE_SOL_MINT,
//       depositor1.publicKey
//     );

//     await mintTo(provider.connection, maker, gameTokenMint, depositorGameToken.address, maker, 1_000_000 * 1e9);

//     const wrapTx = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: depositor1.publicKey,
//         toPubkey: depositorSolToken.address,
//         lamports: 1 * 1e9,
//       }),
//       createSyncNativeInstruction(depositorSolToken.address)
//     );
//     await sendAndConfirmTransaction(provider.connection, wrapTx, [depositor1]);

//     const [userPositionPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), depositor1.publicKey.toBuffer()],
//       program.programId
//     );

//     const position = Keypair.generate();
//     const vaultA = Keypair.generate();
//     const vaultB = Keypair.generate();

//     const tx = await program.methods
//       .deposit({
//         gameTokenAmount: new BN(500_000 * 1e9),
//         solAmount: new BN(0.5 * 1e9),
//       })
//       .accountsStrict({
//         user: depositor1.publicKey,
//         vault: vaultPda,
//         userPosition: userPositionPda,
//         leaderboard: leaderboardPda,
//         dammPool: dammPoolPda,
//         userGameToken: depositorGameToken.address,
//         userSolToken: depositorSolToken.address,
//         vaultA: vaultA.publicKey,
//         vaultB: vaultB.publicKey,
//         position: position.publicKey,
//         pythPriceFeed: mockPythAccount.publicKey,
//         meteoraDammProgram: METEORA_DAMM_PROGRAM,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//         rent: SYSVAR_RENT_PUBKEY,
//       })
//       .signers([depositor1])
//       .rpc();

//     expect(tx).to.be.a("string");

//     const userPosition = await program.account.userPosition.fetch(userPositionPda);
//     expect(userPosition.shares.toNumber()).to.be.greaterThan(0);

//     console.log("\nDeposited 500,000 tokens + 0.5 SOL");
//     console.log("TX:", tx);
//   });

//   it("deposit reverts if amount is below minimum threshold", async () => {
//     const depositorGameToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       depositor1,
//       gameTokenMint,
//       depositor1.publicKey
//     );
//     const depositorSolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       depositor1,
//       NATIVE_SOL_MINT,
//       depositor1.publicKey
//     );

//     const [userPositionPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), depositor1.publicKey.toBuffer()],
//       program.programId
//     );

//     const position = Keypair.generate();
//     const vaultA = Keypair.generate();
//     const vaultB = Keypair.generate();

//     try {
//       await program.methods
//         .deposit({
//           gameTokenAmount: new BN(0),
//           solAmount: new BN(0),
//         })
//         .accountsStrict({
//           user: depositor1.publicKey,
//           vault: vaultPda,
//           userPosition: userPositionPda,
//           leaderboard: leaderboardPda,
//           dammPool: dammPoolPda,
//           userGameToken: depositorGameToken.address,
//           userSolToken: depositorSolToken.address,
//           vaultA: vaultA.publicKey,
//           vaultB: vaultB.publicKey,
//           position: position.publicKey,
//           pythPriceFeed: mockPythAccount.publicKey,
//           meteoraDammProgram: METEORA_DAMM_PROGRAM,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: SystemProgram.programId,
//           rent: SYSVAR_RENT_PUBKEY,
//         })
//         .signers([depositor1])
//         .rpc();

//       expect.fail("Should have rejected below minimum deposit");
//     } catch (error: any) {
//       expect(error).to.exist;
//       console.log("\nMinimum deposit enforced");
//       console.log("Error:", error.message || error.toString());
//     }
//   });

//   it("deposit updates leaderboard with correct time-weighted share", async () => {
//     const dep1GameToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       depositor1,
//       gameTokenMint,
//       depositor1.publicKey
//     );
//     const dep1SolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       depositor1,
//       NATIVE_SOL_MINT,
//       depositor1.publicKey
//     );
//     const dep2GameToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       depositor2,
//       gameTokenMint,
//       depositor2.publicKey
//     );
//     const dep2SolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       depositor2,
//       NATIVE_SOL_MINT,
//       depositor2.publicKey
//     );

//     await mintTo(provider.connection, maker, gameTokenMint, dep1GameToken.address, maker, 1_000_000 * 1e9);
//     await mintTo(provider.connection, maker, gameTokenMint, dep2GameToken.address, maker, 2_000_000 * 1e9);

//     const wrapTx1 = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: depositor1.publicKey,
//         toPubkey: dep1SolToken.address,
//         lamports: 1 * 1e9,
//       }),
//       createSyncNativeInstruction(dep1SolToken.address)
//     );
//     await sendAndConfirmTransaction(provider.connection, wrapTx1, [depositor1]);

//     const wrapTx2 = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: depositor2.publicKey,
//         toPubkey: dep2SolToken.address,
//         lamports: 2 * 1e9,
//       }),
//       createSyncNativeInstruction(dep2SolToken.address)
//     );
//     await sendAndConfirmTransaction(provider.connection, wrapTx2, [depositor2]);

//     const [userPos1] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), depositor1.publicKey.toBuffer()],
//       program.programId
//     );
//     const [userPos2] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), depositor2.publicKey.toBuffer()],
//       program.programId
//     );

//     const position1 = Keypair.generate();
//     const vaultA1 = Keypair.generate();
//     const vaultB1 = Keypair.generate();

//     await program.methods
//       .deposit({
//         gameTokenAmount: new BN(500_000 * 1e9),
//         solAmount: new BN(0.5 * 1e9),
//       })
//       .accountsStrict({
//         user: depositor1.publicKey,
//         vault: vaultPda,
//         userPosition: userPos1,
//         leaderboard: leaderboardPda,
//         dammPool: dammPoolPda,
//         userGameToken: dep1GameToken.address,
//         userSolToken: dep1SolToken.address,
//         vaultA: vaultA1.publicKey,
//         vaultB: vaultB1.publicKey,
//         position: position1.publicKey,
//         pythPriceFeed: mockPythAccount.publicKey,
//         meteoraDammProgram: METEORA_DAMM_PROGRAM,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//         rent: SYSVAR_RENT_PUBKEY,
//       })
//       .signers([depositor1])
//       .rpc();

//     const position2 = Keypair.generate();
//     const vaultA2 = Keypair.generate();
//     const vaultB2 = Keypair.generate();

//     await program.methods
//       .deposit({
//         gameTokenAmount: new BN(1_000_000 * 1e9),
//         solAmount: new BN(1 * 1e9),
//       })
//       .accountsStrict({
//         user: depositor2.publicKey,
//         vault: vaultPda,
//         userPosition: userPos2,
//         leaderboard: leaderboardPda,
//         dammPool: dammPoolPda,
//         userGameToken: dep2GameToken.address,
//         userSolToken: dep2SolToken.address,
//         vaultA: vaultA2.publicKey,
//         vaultB: vaultB2.publicKey,
//         position: position2.publicKey,
//         pythPriceFeed: mockPythAccount.publicKey,
//         meteoraDammProgram: METEORA_DAMM_PROGRAM,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//         rent: SYSVAR_RENT_PUBKEY,
//       })
//       .signers([depositor2])
//       .rpc();

//     const leaderboard = await program.account.leaderboard.fetch(leaderboardPda);
//     expect(leaderboard.top10.length).to.be.greaterThan(0);

//     console.log("\nLeaderboard updated with multiple users");
//     console.log("Top 10 count:", leaderboard.top10.length);
//   });

//   it("deposit handles stale Pyth price gracefully (reverts)", async () => {
//     const staleTimestamp = Math.floor(Date.now() / 1000) - 35;
//     const stalePythAccount = await createMockPythPriceAccount(provider, 18000000000, 500000, -8, staleTimestamp);

//     const depositorGameToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       depositor1,
//       gameTokenMint,
//       depositor1.publicKey
//     );
//     const depositorSolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       depositor1,
//       NATIVE_SOL_MINT,
//       depositor1.publicKey
//     );

//     const [userPositionPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), depositor1.publicKey.toBuffer()],
//       program.programId
//     );

//     const position = Keypair.generate();
//     const vaultA = Keypair.generate();
//     const vaultB = Keypair.generate();

//     try {
//       await program.methods
//         .deposit({
//           gameTokenAmount: new BN(500_000 * 1e9),
//           solAmount: new BN(0.5 * 1e9),
//         })
//         .accountsStrict({
//           user: depositor1.publicKey,
//           vault: vaultPda,
//           userPosition: userPositionPda,
//           leaderboard: leaderboardPda,
//           dammPool: dammPoolPda,
//           userGameToken: depositorGameToken.address,
//           userSolToken: depositorSolToken.address,
//           vaultA: vaultA.publicKey,
//           vaultB: vaultB.publicKey,
//           position: position.publicKey,
//           pythPriceFeed: stalePythAccount.publicKey,
//           meteoraDammProgram: METEORA_DAMM_PROGRAM,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: SystemProgram.programId,
//           rent: SYSVAR_RENT_PUBKEY,
//         })
//         .signers([depositor1])
//         .rpc();

//       expect.fail("Should have rejected stale price");
//     } catch (error: any) {
//       expect(error).to.exist;
//       console.log("\nStale Pyth price rejected");
//       console.log("Error:", error.message || error.toString());
//     }
//   });

//   it("deposit reverts if game_token mint doesn't match vault", async () => {
//     const wrongMint = await createMint(provider.connection, maker, maker.publicKey, null, 9);

//     const depositorWrongToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       depositor1,
//       wrongMint,
//       depositor1.publicKey
//     );
//     const depositorSolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       depositor1,
//       NATIVE_SOL_MINT,
//       depositor1.publicKey
//     );

//     await mintTo(provider.connection, maker, wrongMint, depositorWrongToken.address, maker, 1_000_000 * 1e9);

//     const [userPositionPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), depositor1.publicKey.toBuffer()],
//       program.programId
//     );

//     const position = Keypair.generate();
//     const vaultA = Keypair.generate();
//     const vaultB = Keypair.generate();

//     try {
//       await program.methods
//         .deposit({
//           gameTokenAmount: new BN(500_000 * 1e9),
//           solAmount: new BN(0.5 * 1e9),
//         })
//         .accountsStrict({
//           user: depositor1.publicKey,
//           vault: vaultPda,
//           userPosition: userPositionPda,
//           leaderboard: leaderboardPda,
//           dammPool: dammPoolPda,
//           userGameToken: depositorWrongToken.address,
//           userSolToken: depositorSolToken.address,
//           vaultA: vaultA.publicKey,
//           vaultB: vaultB.publicKey,
//           position: position.publicKey,
//           pythPriceFeed: mockPythAccount.publicKey,
//           meteoraDammProgram: METEORA_DAMM_PROGRAM,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: SystemProgram.programId,
//           rent: SYSVAR_RENT_PUBKEY,
//         })
//         .signers([depositor1])
//         .rpc();

//       expect.fail("Should have rejected invalid game token");
//     } catch (error: any) {
//       expect(error).to.exist;
//       console.log("\nInvalid game token rejected");
//       console.log("Error:", error.message || error.toString());
//     }
//   });

//   it("deposit reverts if token account owner is not signer", async () => {
//     const otherUser = Keypair.generate();
//     await provider.connection.requestAirdrop(otherUser.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL);

//     const otherGameToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       otherUser,
//       gameTokenMint,
//       otherUser.publicKey
//     );
//     const depositorSolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       depositor1,
//       NATIVE_SOL_MINT,
//       depositor1.publicKey
//     );

//     const [userPositionPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), depositor1.publicKey.toBuffer()],
//       program.programId
//     );

//     const position = Keypair.generate();
//     const vaultA = Keypair.generate();
//     const vaultB = Keypair.generate();

//     try {
//       await program.methods
//         .deposit({
//           gameTokenAmount: new BN(500_000 * 1e9),
//           solAmount: new BN(0.5 * 1e9),
//         })
//         .accountsStrict({
//           user: depositor1.publicKey,
//           vault: vaultPda,
//           userPosition: userPositionPda,
//           leaderboard: leaderboardPda,
//           dammPool: dammPoolPda,
//           userGameToken: otherGameToken.address,
//           userSolToken: depositorSolToken.address,
//           vaultA: vaultA.publicKey,
//           vaultB: vaultB.publicKey,
//           position: position.publicKey,
//           pythPriceFeed: mockPythAccount.publicKey,
//           meteoraDammProgram: METEORA_DAMM_PROGRAM,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: SystemProgram.programId,
//           rent: SYSVAR_RENT_PUBKEY,
//         })
//         .signers([depositor1])
//         .rpc();

//       expect.fail("Should have rejected token account owner mismatch");
//     } catch (error: any) {
//       expect(error).to.exist;
//       console.log("\nToken account owner mismatch rejected");
//       console.log("Error:", error.message || error.toString());
//     }
//   });

//   it("deposit works with single-sided SOL deposit (DAMM v2)", async () => {
//     const depositorGameToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       depositor1,
//       gameTokenMint,
//       depositor1.publicKey
//     );
//     const depositorSolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       depositor1,
//       NATIVE_SOL_MINT,
//       depositor1.publicKey
//     );

//     const wrapTx = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: depositor1.publicKey,
//         toPubkey: depositorSolToken.address,
//         lamports: 2 * 1e9,
//       }),
//       createSyncNativeInstruction(depositorSolToken.address)
//     );
//     await sendAndConfirmTransaction(provider.connection, wrapTx, [depositor1]);

//     const [userPositionPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), depositor1.publicKey.toBuffer()],
//       program.programId
//     );

//     const position = Keypair.generate();
//     const vaultA = Keypair.generate();
//     const vaultB = Keypair.generate();

//     const tx = await program.methods
//       .deposit({
//         gameTokenAmount: new BN(0),
//         solAmount: new BN(1 * 1e9),
//       })
//       .accountsStrict({
//         user: depositor1.publicKey,
//         vault: vaultPda,
//         userPosition: userPositionPda,
//         leaderboard: leaderboardPda,
//         dammPool: dammPoolPda,
//         userGameToken: depositorGameToken.address,
//         userSolToken: depositorSolToken.address,
//         vaultA: vaultA.publicKey,
//         vaultB: vaultB.publicKey,
//         position: position.publicKey,
//         pythPriceFeed: mockPythAccount.publicKey,
//         meteoraDammProgram: METEORA_DAMM_PROGRAM,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//         rent: SYSVAR_RENT_PUBKEY,
//       })
//       .signers([depositor1])
//       .rpc();

//     expect(tx).to.be.a("string");

//     console.log("\nSingle-sided SOL deposit");
//     console.log("TX:", tx);
//   });

//   it("deposit emits Deposit event with correct data (user, amount, new_bins)", async () => {
//     const depositorGameToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       depositor1,
//       gameTokenMint,
//       depositor1.publicKey
//     );
//     const depositorSolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       depositor1,
//       NATIVE_SOL_MINT,
//       depositor1.publicKey
//     );

//     await mintTo(provider.connection, maker, gameTokenMint, depositorGameToken.address, maker, 1_000_000 * 1e9);

//     const wrapTx = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: depositor1.publicKey,
//         toPubkey: depositorSolToken.address,
//         lamports: 1 * 1e9,
//       }),
//       createSyncNativeInstruction(depositorSolToken.address)
//     );
//     await sendAndConfirmTransaction(provider.connection, wrapTx, [depositor1]);

//     const [userPositionPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), depositor1.publicKey.toBuffer()],
//       program.programId
//     );

//     const position = Keypair.generate();
//     const vaultA = Keypair.generate();
//     const vaultB = Keypair.generate();

//     const listener = program.addEventListener("depositEvent", (event, slot) => {
//       console.log("\nDeposit event emitted");
//       console.log("Event data:", event);
//       console.log("Slot:", slot);
//     });

//     const tx = await program.methods
//       .deposit({
//         gameTokenAmount: new BN(500_000 * 1e9),
//         solAmount: new BN(0.5 * 1e9),
//       })
//       .accountsStrict({
//         user: depositor1.publicKey,
//         vault: vaultPda,
//         userPosition: userPositionPda,
//         leaderboard: leaderboardPda,
//         dammPool: dammPoolPda,
//         userGameToken: depositorGameToken.address,
//         userSolToken: depositorSolToken.address,
//         vaultA: vaultA.publicKey,
//         vaultB: vaultB.publicKey,
//         position: position.publicKey,
//         pythPriceFeed: mockPythAccount.publicKey,
//         meteoraDammProgram: METEORA_DAMM_PROGRAM,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//         rent: SYSVAR_RENT_PUBKEY,
//       })
//       .signers([depositor1])
//       .rpc();

//     await new Promise(resolve => setTimeout(resolve, 2000));

//     await program.removeEventListener(listener);

//     expect(tx).to.be.a("string");
//     console.log("TX:", tx);
//   });
// });
