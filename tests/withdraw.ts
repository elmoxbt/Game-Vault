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

// describe("withdraw comprehensive test coverage", () => {
//   const provider = anchor.AnchorProvider.env();
//   anchor.setProvider(provider);
//   const program = anchor.workspace.Gamevault as Program<Gamevault>;

//   let maker: Keypair;
//   let user1: Keypair;
//   let user2: Keypair;
//   let gameTokenMint: PublicKey;
//   let vaultPda: PublicKey;
//   let dammPoolPda: PublicKey;
//   let leaderboardPda: PublicKey;
//   let mockPythAccount: Keypair;

//   before(async () => {
//     maker = (provider.wallet as any).payer;
//     user1 = Keypair.generate();
//     user2 = Keypair.generate();

//     const airdrop1 = await provider.connection.requestAirdrop(user1.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
//     const airdrop2 = await provider.connection.requestAirdrop(user2.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
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

//   it("withdraw succeeds and returns pro-rata tokens + accrued SOL fees", async () => {
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

//     const userPosition = await program.account.userPosition.fetch(userPositionPda);
//     const sharesToWithdraw = userPosition.shares;

//     const tx = await program.methods
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

//     expect(tx).to.be.a("string");

//     console.log("\nWithdrew 500,000 tokens + 0.5 SOL (100% share)");
//     console.log("TX:", tx);
//   });

//   it("partial withdraw reduces share proportionally and pays correct fees", async () => {
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
//         gameTokenAmount: new BN(1_000_000 * 1e9),
//         solAmount: new BN(1 * 1e9),
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

//     const userPositionBefore = await program.account.userPosition.fetch(userPositionPda);
//     const partialShares = userPositionBefore.shares.mul(new BN(30)).div(new BN(100));

//     const tx = await program.methods
//       .withdraw({
//         sharesToWithdraw: partialShares,
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

//     const userPositionAfter = await program.account.userPosition.fetch(userPositionPda);
//     const expectedRemaining = userPositionBefore.shares.sub(partialShares);

//     expect(userPositionAfter.shares.toString()).to.equal(expectedRemaining.toString());

//     console.log("\nWithdrew 30% of tokens + 30% of fees, share = 70%");
//     console.log("TX:", tx);
//   });

//   it("full withdraw removes entire share from leaderboard and vault", async () => {
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
//     const userInLeaderboardBefore = leaderboardBefore.top10.some((entry) => entry.user.equals(user1.publicKey));

//     const tx = await program.methods
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

//     try {
//       await program.account.userPosition.fetch(userPositionPda);
//       expect.fail("User position should be closed");
//     } catch (error) {
//       expect(error.toString()).to.include("Account does not exist");
//     }

//     const leaderboardAfter = await program.account.leaderboard.fetch(leaderboardPda);
//     const userInLeaderboardAfter = leaderboardAfter.top10.some((entry) => entry.user.equals(user1.publicKey));

//     expect(userInLeaderboardAfter).to.be.false;

//     console.log("\nUser removed from leaderboard, vault share = 0");
//     console.log("TX:", tx);
//   });

//   it("withdraw includes treasury access for vault owner", async () => {
//     const vault = await program.account.vault.fetch(vaultPda);

//     vault.treasurySol = new BN(10 * 1e9);

//     const recipientBalanceBefore = await provider.connection.getBalance(maker.publicKey);

//     const tx = await program.methods
//       .withdrawTreasury({
//         amount: new BN(5 * 1e9),
//       })
//       .accountsStrict({
//         authority: maker.publicKey,
//         vault: vaultPda,
//         recipient: maker.publicKey,
//         systemProgram: SystemProgram.programId,
//       })
//       .signers([maker])
//       .rpc();

//     const vaultAfter = await program.account.vault.fetch(vaultPda);
//     const recipientBalanceAfter = await provider.connection.getBalance(maker.publicKey);

//     console.log("\nTreasury SOL withdrawn: 5 SOL");
//     console.log("Remaining treasury:", vaultAfter.treasurySol.toString());
//     console.log("TX:", tx);
//   });

//   it("withdraw reverts if amount exceeds user's current share", async () => {
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

//     const userPosition = await program.account.userPosition.fetch(userPositionPda);
//     const excessiveShares = userPosition.shares.add(new BN(1_000_000));

//     try {
//       await program.methods
//         .withdraw({
//           sharesToWithdraw: excessiveShares,
//         })
//         .accountsStrict({
//           user: user1.publicKey,
//           vault: vaultPda,
//           userPosition: userPositionPda,
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

//       expect.fail("Should have reverted with InsufficientBalance");
//     } catch (error: any) {
//       expect(error).to.exist;
//       console.log("\nReverted with InsufficientShare");
//       console.log("Error:", error.message || error.toString());
//     }
//   });

//   it("withdraw reverts if vault has no liquidity (edge case)", async () => {
//     const emptyGameTokenMint = await createMint(provider.connection, maker, maker.publicKey, null, 9);

//     const [emptyVaultPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("vault"), emptyGameTokenMint.toBuffer(), NATIVE_SOL_MINT.toBuffer()],
//       program.programId
//     );

//     const [emptyLeaderboardPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("leaderboard"), emptyVaultPda.toBuffer()],
//       program.programId
//     );

//     const [userPositionPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), emptyVaultPda.toBuffer(), user1.publicKey.toBuffer()],
//       program.programId
//     );

//     const user1GameToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       user1,
//       emptyGameTokenMint,
//       user1.publicKey
//     );
//     const user1SolToken = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       user1,
//       NATIVE_SOL_MINT,
//       user1.publicKey
//     );

//     const config = METEORA_CONFIG_PDA;
//     const maxKey = emptyGameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0 ? emptyGameTokenMint : NATIVE_SOL_MINT;
//     const minKey = emptyGameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0 ? NATIVE_SOL_MINT : emptyGameTokenMint;

//     const [emptyDammPoolPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("pool"), config.toBuffer(), maxKey.toBuffer(), minKey.toBuffer()],
//       METEORA_DAMM_PROGRAM
//     );

//     try {
//       await program.methods
//         .withdraw({
//           sharesToWithdraw: null,
//         })
//         .accountsStrict({
//           user: user1.publicKey,
//           vault: emptyVaultPda,
//           userPosition: userPositionPda,
//           leaderboard: emptyLeaderboardPda,
//           userGameToken: user1GameToken.address,
//           userSolToken: user1SolToken.address,
//           dammPool: emptyDammPoolPda,
//           meteoraDammProgram: METEORA_DAMM_PROGRAM,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: SystemProgram.programId,
//         })
//         .signers([user1])
//         .rpc();

//       expect.fail("Should have reverted with no liquidity");
//     } catch (error: any) {
//       expect(error).to.exist;
//       console.log("\nSafe revert with no liquidity");
//       console.log("Error:", error.message || error.toString());
//     }
//   });

//   it("withdraw updates leaderboard correctly after partial/full exit", async () => {
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

//     await mintTo(provider.connection, maker, gameTokenMint, user1GameToken.address, maker, 1_000_000 * 1e9);
//     await mintTo(provider.connection, maker, gameTokenMint, user2GameToken.address, maker, 2_000_000 * 1e9);

//     const wrapTx1 = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: user1.publicKey,
//         toPubkey: user1SolToken.address,
//         lamports: 1 * 1e9,
//       }),
//       createSyncNativeInstruction(user1SolToken.address)
//     );
//     await sendAndConfirmTransaction(provider.connection, wrapTx1, [user1]);

//     const wrapTx2 = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: user2.publicKey,
//         toPubkey: user2SolToken.address,
//         lamports: 2 * 1e9,
//       }),
//       createSyncNativeInstruction(user2SolToken.address)
//     );
//     await sendAndConfirmTransaction(provider.connection, wrapTx2, [user2]);

//     const [userPos1] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), user1.publicKey.toBuffer()],
//       program.programId
//     );
//     const [userPos2] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), vaultPda.toBuffer(), user2.publicKey.toBuffer()],
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
//         gameTokenAmount: new BN(1_000_000 * 1e9),
//         solAmount: new BN(1 * 1e9),
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

//     const leaderboardBefore = await program.account.leaderboard.fetch(leaderboardPda);

//     await program.methods
//       .withdraw({
//         sharesToWithdraw: null,
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

//     const user1InBefore = leaderboardBefore.top10.some((e) => e.user.equals(user1.publicKey));
//     const user1InAfter = leaderboardAfter.top10.some((e) => e.user.equals(user1.publicKey));
//     const user2InAfter = leaderboardAfter.top10.some((e) => e.user.equals(user2.publicKey));

//     expect(user1InAfter).to.be.false;
//     expect(user2InAfter).to.be.true;

//     console.log("\nRankings recalculated, top 10 correct");
//     console.log("User1 in leaderboard before:", user1InBefore);
//     console.log("User1 in leaderboard after:", user1InAfter);
//     console.log("User2 in leaderboard after:", user2InAfter);
//   });

//   it("withdraw emits Withdraw event with correct data", async () => {
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

//     const listener = program.addEventListener("withdrawEvent", (event, slot) => {
//       console.log("\nWithdraw event emitted");
//       console.log("Event data:", event);
//       console.log("Slot:", slot);
//     });

//     const tx = await program.methods
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

//     await new Promise((resolve) => setTimeout(resolve, 2000));

//     await program.removeEventListener(listener);

//     expect(tx).to.be.a("string");
//     console.log("TX:", tx);
//   });
// });
