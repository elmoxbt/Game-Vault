// import * as anchor from "@coral-xyz/anchor";
// import { Program, BN, AnchorProvider, Wallet } from "@coral-xyz/anchor";
// import { Gamevault } from "../target/types/gamevault";
// import {
//   createMint,
//   TOKEN_PROGRAM_ID,
//   TOKEN_2022_PROGRAM_ID,
//   getOrCreateAssociatedTokenAccount,
//   mintTo,
//   createSyncNativeInstruction,
// } from "@solana/spl-token";
// import {
//   PublicKey,
//   Keypair,
//   SystemProgram,
//   SYSVAR_RENT_PUBKEY,
//   Connection,
//   Transaction,
//   sendAndConfirmTransaction,
//   ComputeBudgetProgram,
//   AccountMeta,
// } from "@solana/web3.js";
// import { expect } from "chai";
// import * as fs from "fs";

// const NATIVE_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
// const METEORA_DAMM_PROGRAM = new PublicKey("4eDLfPB8fwFxReyHE695Kjtdh2MJinrbekJ9aTLjYBqq");
// const METEORA_CONFIG_PDA = new PublicKey("HuRfytxdwDkWeohmjUPFsMfhgX8gedC1rpLyTSK5omTv");

// // Mock Pyth price account helper
// async function createMockPythPriceAccount(
//   provider: AnchorProvider,
//   price: number,
//   confidence: number,
//   exponent: number = -8
// ): Promise<Keypair> {
//   const pythAccount = Keypair.generate();

//   const priceData = Buffer.alloc(3200);
//   priceData.writeUInt32LE(1, 0); // version
//   priceData.writeUInt32LE(3, 4); // type (3 = price account)
//   priceData.writeBigInt64LE(BigInt(price), 208); // price
//   priceData.writeBigUInt64LE(BigInt(confidence), 216); // confidence
//   priceData.writeInt32LE(exponent, 224); // exponent

//   const lamports = await provider.connection.getMinimumBalanceForRentExemption(3200);

//   const tx = new Transaction().add(
//     SystemProgram.createAccount({
//       fromPubkey: provider.wallet.publicKey,
//       newAccountPubkey: pythAccount.publicKey,
//       lamports,
//       space: 3200,
//       programId: new PublicKey("FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH"), // Pyth program ID
//     })
//   );

//   await sendAndConfirmTransaction(provider.connection, tx, [provider.wallet.payer, pythAccount]);

//   await provider.connection.confirmTransaction(
//     await provider.connection.requestAirdrop(pythAccount.publicKey, lamports)
//   );

//   const txUpdate = await provider.connection.sendTransaction(
//     new Transaction().add({
//       keys: [{ pubkey: pythAccount.publicKey, isSigner: false, isWritable: true }],
//       programId: SystemProgram.programId,
//       data: priceData,
//     }),
//     [provider.wallet.payer]
//   );
//   await provider.connection.confirmTransaction(txUpdate);

//   return pythAccount;
// }

// describe("init_vault comprehensive test coverage", () => {
//   const provider = anchor.AnchorProvider.env();
//   anchor.setProvider(provider);
//   const program = anchor.workspace.Gamevault as Program<Gamevault>;

//   let maker: Keypair;
//   let mockPythAccount: Keypair;

//   before(async () => {
//     const walletPath = process.env.ANCHOR_WALLET || require("os").homedir() + "/.config/solana/id.json";
//     const walletKeypair = Keypair.fromSecretKey(
//       Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
//     );
//     maker = walletKeypair;

//     mockPythAccount = await createMockPythPriceAccount(provider, 18000000000, 500000, -8);
//   });

//   it("init_vault succeeds and creates a real DAMM v2 pool with dynamic fees", async () => {
//     const gameTokenMint = await createMint(
//       provider.connection,
//       maker,
//       maker.publicKey,
//       null,
//       9
//     );

//     const [vaultPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("vault"), gameTokenMint.toBuffer(), NATIVE_SOL_MINT.toBuffer()],
//       program.programId
//     );

//     const config = METEORA_CONFIG_PDA;
//     const maxKey = gameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0
//       ? gameTokenMint
//       : NATIVE_SOL_MINT;
//     const minKey = gameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0
//       ? NATIVE_SOL_MINT
//       : gameTokenMint;

//     const [dammPoolPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("pool"), config.toBuffer(), maxKey.toBuffer(), minKey.toBuffer()],
//       METEORA_DAMM_PROGRAM
//     );

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

//     await mintTo(
//       provider.connection,
//       maker,
//       gameTokenMint,
//       payerGameTokenAccount.address,
//       maker,
//       gameTokenAmount.toNumber()
//     );

//     const wrapTx = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: maker.publicKey,
//         toPubkey: payerSolTokenAccount.address,
//         lamports: solAmountLamports,
//       }),
//       createSyncNativeInstruction(payerSolTokenAccount.address)
//     );

//     await sendAndConfirmTransaction(provider.connection, wrapTx, [maker]);

//     const [poolAuthority] = PublicKey.findProgramAddressSync(
//       [Buffer.from("pool_authority")],
//       METEORA_DAMM_PROGRAM
//     );

//     const [eventAuthority] = PublicKey.findProgramAddressSync(
//       [Buffer.from("__event_authority")],
//       METEORA_DAMM_PROGRAM
//     );

//     const tx = await program.methods
//       .initVault({
//         liquidity: new BN(1_000_000 * 1e9),
//         initialPrice: 1e8,
//       })
//       .preInstructions([
//         ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
//       ])
//       .accountsStrict({
//         maker: maker.publicKey,
//         vault: vaultPda,
//         gameTokenMint: gameTokenMint,
//         solMint: NATIVE_SOL_MINT,
//         config: config,
//         poolAuthority: poolAuthority,
//         dammPool: dammPoolPda,
//         positionNftMint: positionNftMint.publicKey,
//         positionNftAccount: positionNftAccount,
//         position: position,
//         tokenAVault: tokenAVault,
//         tokenBVault: tokenBVault,
//         payerTokenA: payerGameTokenAccount.address,
//         payerTokenB: payerSolTokenAccount.address,
//         pythPriceFeed: mockPythAccount.publicKey,
//         tokenAProgram: TOKEN_PROGRAM_ID,
//         tokenBProgram: TOKEN_PROGRAM_ID,
//         token2022Program: TOKEN_2022_PROGRAM_ID,
//         meteoraDammProgram: METEORA_DAMM_PROGRAM,
//         eventAuthority: eventAuthority,
//         systemProgram: SystemProgram.programId,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         rent: SYSVAR_RENT_PUBKEY,
//       })
//       .signers([maker, positionNftMint])
//       .rpc();

//     expect(tx).to.be.a("string");

//     const vault = await program.account.vault.fetch(vaultPda);
//     expect(vault.dammPool.toString()).to.equal(dammPoolPda.toString());
//     expect(vault.gameTokenMint.toString()).to.equal(gameTokenMint.toString());

//     const poolAccount = await provider.connection.getAccountInfo(dammPoolPda);
//     expect(poolAccount).to.not.be.null;

//     console.log("\nTest 1: DAMM v2 pool created");
//     console.log("Pool address:", dammPoolPda.toString());
//     console.log("TX:", tx);
//     console.log("Important addresses:");
//     console.log("VAULT_PDA=", vaultPda.toString());
//     console.log("GAME_TOKEN_MINT=", gameTokenMint.toString());
//     console.log("DAMM_POOL=", vault.dammPool.toString());
//   });

//   it("init_vault stores correct initial Pyth price and confidence from real feed", async () => {
//     const gameTokenMint = await createMint(
//       provider.connection,
//       maker,
//       maker.publicKey,
//       null,
//       9
//     );

//     const [vaultPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("vault"), gameTokenMint.toBuffer(), NATIVE_SOL_MINT.toBuffer()],
//       program.programId
//     );

//     const config = METEORA_CONFIG_PDA;
//     const maxKey = gameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0
//       ? gameTokenMint
//       : NATIVE_SOL_MINT;
//     const minKey = gameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0
//       ? NATIVE_SOL_MINT
//       : gameTokenMint;

//     const [dammPoolPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("pool"), config.toBuffer(), maxKey.toBuffer(), minKey.toBuffer()],
//       METEORA_DAMM_PROGRAM
//     );

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

//     await mintTo(
//       provider.connection,
//       maker,
//       gameTokenMint,
//       payerGameTokenAccount.address,
//       maker,
//       gameTokenAmount.toNumber()
//     );

//     const wrapTx = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: maker.publicKey,
//         toPubkey: payerSolTokenAccount.address,
//         lamports: solAmountLamports,
//       }),
//       createSyncNativeInstruction(payerSolTokenAccount.address)
//     );

//     await sendAndConfirmTransaction(provider.connection, wrapTx, [maker]);

//     const [poolAuthority] = PublicKey.findProgramAddressSync(
//       [Buffer.from("pool_authority")],
//       METEORA_DAMM_PROGRAM
//     );

//     const [eventAuthority] = PublicKey.findProgramAddressSync(
//       [Buffer.from("__event_authority")],
//       METEORA_DAMM_PROGRAM
//     );

//     const tx = await program.methods
//       .initVault({
//         liquidity: new BN(1_000_000 * 1e9),
//         initialPrice: 1e8,
//       })
//       .preInstructions([
//         ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
//       ])
//       .accountsStrict({
//         maker: maker.publicKey,
//         vault: vaultPda,
//         gameTokenMint: gameTokenMint,
//         solMint: NATIVE_SOL_MINT,
//         config: config,
//         poolAuthority: poolAuthority,
//         dammPool: dammPoolPda,
//         positionNftMint: positionNftMint.publicKey,
//         positionNftAccount: positionNftAccount,
//         position: position,
//         tokenAVault: tokenAVault,
//         tokenBVault: tokenBVault,
//         payerTokenA: payerGameTokenAccount.address,
//         payerTokenB: payerSolTokenAccount.address,
//         pythPriceFeed: mockPythAccount.publicKey,
//         tokenAProgram: TOKEN_PROGRAM_ID,
//         tokenBProgram: TOKEN_PROGRAM_ID,
//         token2022Program: TOKEN_2022_PROGRAM_ID,
//         meteoraDammProgram: METEORA_DAMM_PROGRAM,
//         eventAuthority: eventAuthority,
//         systemProgram: SystemProgram.programId,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         rent: SYSVAR_RENT_PUBKEY,
//       })
//       .signers([maker, positionNftMint])
//       .rpc();

//     const vault = await program.account.vault.fetch(vaultPda);

//     expect(vault.lastPythPrice.toNumber()).to.be.greaterThan(0);
//     expect(vault.lastPythConfidence.toNumber()).to.be.greaterThan(0);

//     console.log("\nTest 2: Pyth price stored");
//     console.log("Price:", vault.lastPythPrice.toString());
//     console.log("Confidence:", vault.lastPythConfidence.toString());
//     console.log("TX:", tx);
//   });

//   it("init_vault reverts if game_token mint is invalid", async () => {
//     const invalidGameTokenMint = await createMint(
//       provider.connection,
//       maker,
//       maker.publicKey,
//       null,
//       6
//     );

//     const [vaultPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("vault"), invalidGameTokenMint.toBuffer(), NATIVE_SOL_MINT.toBuffer()],
//       program.programId
//     );

//     const config = METEORA_CONFIG_PDA;
//     const maxKey = invalidGameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0
//       ? invalidGameTokenMint
//       : NATIVE_SOL_MINT;
//     const minKey = invalidGameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0
//       ? NATIVE_SOL_MINT
//       : invalidGameTokenMint;

//     const [dammPoolPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("pool"), config.toBuffer(), maxKey.toBuffer(), minKey.toBuffer()],
//       METEORA_DAMM_PROGRAM
//     );

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
//       [Buffer.from("token_vault"), invalidGameTokenMint.toBuffer(), dammPoolPda.toBuffer()],
//       METEORA_DAMM_PROGRAM
//     );

//     const [tokenBVault] = PublicKey.findProgramAddressSync(
//       [Buffer.from("token_vault"), NATIVE_SOL_MINT.toBuffer(), dammPoolPda.toBuffer()],
//       METEORA_DAMM_PROGRAM
//     );

//     const payerGameTokenAccount = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       maker,
//       invalidGameTokenMint,
//       maker.publicKey
//     );

//     const payerSolTokenAccount = await getOrCreateAssociatedTokenAccount(
//       provider.connection,
//       maker,
//       NATIVE_SOL_MINT,
//       maker.publicKey
//     );

//     const gameTokenAmount = new BN(1_000_000).mul(new BN(1e6));
//     const solAmountLamports = 1 * 1e9;

//     await mintTo(
//       provider.connection,
//       maker,
//       invalidGameTokenMint,
//       payerGameTokenAccount.address,
//       maker,
//       gameTokenAmount.toNumber()
//     );

//     const wrapTx = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: maker.publicKey,
//         toPubkey: payerSolTokenAccount.address,
//         lamports: solAmountLamports,
//       }),
//       createSyncNativeInstruction(payerSolTokenAccount.address)
//     );

//     await sendAndConfirmTransaction(provider.connection, wrapTx, [maker]);

//     const [poolAuthority] = PublicKey.findProgramAddressSync(
//       [Buffer.from("pool_authority")],
//       METEORA_DAMM_PROGRAM
//     );

//     const [eventAuthority] = PublicKey.findProgramAddressSync(
//       [Buffer.from("__event_authority")],
//       METEORA_DAMM_PROGRAM
//     );

//     try {
//       await program.methods
//         .initVault({
//           liquidity: new BN(1_000_000 * 1e9),
//           initialPrice: 1e8,
//         })
//         .preInstructions([
//           ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
//         ])
//         .accountsStrict({
//           maker: maker.publicKey,
//           vault: vaultPda,
//           gameTokenMint: invalidGameTokenMint,
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

//       expect.fail("Should have rejected invalid mint");
//     } catch (error: any) {
//       expect(error).to.exist;
//       console.log("\nTest 3: Invalid mint rejected");
//       console.log("Error:", error.message || error.toString());
//     }
//   });

//   it("init_vault reverts if initial deposit is below minimum threshold", async () => {
//     const gameTokenMint = await createMint(
//       provider.connection,
//       maker,
//       maker.publicKey,
//       null,
//       9
//     );

//     const [vaultPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("vault"), gameTokenMint.toBuffer(), NATIVE_SOL_MINT.toBuffer()],
//       program.programId
//     );

//     const config = METEORA_CONFIG_PDA;
//     const maxKey = gameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0
//       ? gameTokenMint
//       : NATIVE_SOL_MINT;
//     const minKey = gameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0
//       ? NATIVE_SOL_MINT
//       : gameTokenMint;

//     const [dammPoolPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("pool"), config.toBuffer(), maxKey.toBuffer(), minKey.toBuffer()],
//       METEORA_DAMM_PROGRAM
//     );

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

//     const gameTokenAmount = new BN(1);
//     const solAmountLamports = 1;

//     await mintTo(
//       provider.connection,
//       maker,
//       gameTokenMint,
//       payerGameTokenAccount.address,
//       maker,
//       gameTokenAmount.toNumber()
//     );

//     const wrapTx = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: maker.publicKey,
//         toPubkey: payerSolTokenAccount.address,
//         lamports: solAmountLamports,
//       }),
//       createSyncNativeInstruction(payerSolTokenAccount.address)
//     );

//     await sendAndConfirmTransaction(provider.connection, wrapTx, [maker]);

//     const [poolAuthority] = PublicKey.findProgramAddressSync(
//       [Buffer.from("pool_authority")],
//       METEORA_DAMM_PROGRAM
//     );

//     const [eventAuthority] = PublicKey.findProgramAddressSync(
//       [Buffer.from("__event_authority")],
//       METEORA_DAMM_PROGRAM
//     );

//     try {
//       await program.methods
//         .initVault({
//           liquidity: new BN(1),
//           initialPrice: 1e8,
//         })
//         .preInstructions([
//           ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
//         ])
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

//       expect.fail("Should have rejected below minimum deposit");
//     } catch (error: any) {
//       expect(error).to.exist;
//       console.log("\nTest 4: Minimum deposit enforced");
//       console.log("Error:", error.message || error.toString());
//     }
//   });

//   it("init_vault reverts if called twice on same game_token (idempotency)", async () => {
//     const gameTokenMint = await createMint(
//       provider.connection,
//       maker,
//       maker.publicKey,
//       null,
//       9
//     );

//     const [vaultPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("vault"), gameTokenMint.toBuffer(), NATIVE_SOL_MINT.toBuffer()],
//       program.programId
//     );

//     const config = METEORA_CONFIG_PDA;
//     const maxKey = gameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0
//       ? gameTokenMint
//       : NATIVE_SOL_MINT;
//     const minKey = gameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0
//       ? NATIVE_SOL_MINT
//       : gameTokenMint;

//     const [dammPoolPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("pool"), config.toBuffer(), maxKey.toBuffer(), minKey.toBuffer()],
//       METEORA_DAMM_PROGRAM
//     );

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

//     await mintTo(
//       provider.connection,
//       maker,
//       gameTokenMint,
//       payerGameTokenAccount.address,
//       maker,
//       gameTokenAmount.toNumber()
//     );

//     const wrapTx = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: maker.publicKey,
//         toPubkey: payerSolTokenAccount.address,
//         lamports: solAmountLamports,
//       }),
//       createSyncNativeInstruction(payerSolTokenAccount.address)
//     );

//     await sendAndConfirmTransaction(provider.connection, wrapTx, [maker]);

//     const [poolAuthority] = PublicKey.findProgramAddressSync(
//       [Buffer.from("pool_authority")],
//       METEORA_DAMM_PROGRAM
//     );

//     const [eventAuthority] = PublicKey.findProgramAddressSync(
//       [Buffer.from("__event_authority")],
//       METEORA_DAMM_PROGRAM
//     );

//     await program.methods
//       .initVault({
//         liquidity: new BN(1_000_000 * 1e9),
//         initialPrice: 1e8,
//       })
//       .preInstructions([
//         ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
//       ])
//       .accountsStrict({
//         maker: maker.publicKey,
//         vault: vaultPda,
//         gameTokenMint: gameTokenMint,
//         solMint: NATIVE_SOL_MINT,
//         config: config,
//         poolAuthority: poolAuthority,
//         dammPool: dammPoolPda,
//         positionNftMint: positionNftMint.publicKey,
//         positionNftAccount: positionNftAccount,
//         position: position,
//         tokenAVault: tokenAVault,
//         tokenBVault: tokenBVault,
//         payerTokenA: payerGameTokenAccount.address,
//         payerTokenB: payerSolTokenAccount.address,
//         pythPriceFeed: mockPythAccount.publicKey,
//         tokenAProgram: TOKEN_PROGRAM_ID,
//         tokenBProgram: TOKEN_PROGRAM_ID,
//         token2022Program: TOKEN_2022_PROGRAM_ID,
//         meteoraDammProgram: METEORA_DAMM_PROGRAM,
//         eventAuthority: eventAuthority,
//         systemProgram: SystemProgram.programId,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         rent: SYSVAR_RENT_PUBKEY,
//       })
//       .signers([maker, positionNftMint])
//       .rpc();

//     const positionNftMint2 = Keypair.generate();

//     const [positionNftAccount2] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position_nft_account"), positionNftMint2.publicKey.toBuffer()],
//       METEORA_DAMM_PROGRAM
//     );

//     const [position2] = PublicKey.findProgramAddressSync(
//       [Buffer.from("position"), positionNftMint2.publicKey.toBuffer()],
//       METEORA_DAMM_PROGRAM
//     );

//     await mintTo(
//       provider.connection,
//       maker,
//       gameTokenMint,
//       payerGameTokenAccount.address,
//       maker,
//       gameTokenAmount.toNumber()
//     );

//     const wrapTx2 = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: maker.publicKey,
//         toPubkey: payerSolTokenAccount.address,
//         lamports: solAmountLamports,
//       }),
//       createSyncNativeInstruction(payerSolTokenAccount.address)
//     );

//     await sendAndConfirmTransaction(provider.connection, wrapTx2, [maker]);

//     try {
//       await program.methods
//         .initVault({
//           liquidity: new BN(1_000_000 * 1e9),
//           initialPrice: 1e8,
//         })
//         .preInstructions([
//           ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
//         ])
//         .accountsStrict({
//           maker: maker.publicKey,
//           vault: vaultPda,
//           gameTokenMint: gameTokenMint,
//           solMint: NATIVE_SOL_MINT,
//           config: config,
//           poolAuthority: poolAuthority,
//           dammPool: dammPoolPda,
//           positionNftMint: positionNftMint2.publicKey,
//           positionNftAccount: positionNftAccount2,
//           position: position2,
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
//         .signers([maker, positionNftMint2])
//         .rpc();

//       expect.fail("Should have rejected double initialization");
//     } catch (error: any) {
//       expect(error).to.exist;
//       console.log("\nTest 5: Double initialization prevented");
//       console.log("Error:", error.message || error.toString());
//     }
//   });

//   it("init_vault sets correct vault owner/authority", async () => {
//     const gameTokenMint = await createMint(
//       provider.connection,
//       maker,
//       maker.publicKey,
//       null,
//       9
//     );

//     const [vaultPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("vault"), gameTokenMint.toBuffer(), NATIVE_SOL_MINT.toBuffer()],
//       program.programId
//     );

//     const config = METEORA_CONFIG_PDA;
//     const maxKey = gameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0
//       ? gameTokenMint
//       : NATIVE_SOL_MINT;
//     const minKey = gameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0
//       ? NATIVE_SOL_MINT
//       : gameTokenMint;

//     const [dammPoolPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("pool"), config.toBuffer(), maxKey.toBuffer(), minKey.toBuffer()],
//       METEORA_DAMM_PROGRAM
//     );

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

//     await mintTo(
//       provider.connection,
//       maker,
//       gameTokenMint,
//       payerGameTokenAccount.address,
//       maker,
//       gameTokenAmount.toNumber()
//     );

//     const wrapTx = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: maker.publicKey,
//         toPubkey: payerSolTokenAccount.address,
//         lamports: solAmountLamports,
//       }),
//       createSyncNativeInstruction(payerSolTokenAccount.address)
//     );

//     await sendAndConfirmTransaction(provider.connection, wrapTx, [maker]);

//     const [poolAuthority] = PublicKey.findProgramAddressSync(
//       [Buffer.from("pool_authority")],
//       METEORA_DAMM_PROGRAM
//     );

//     const [eventAuthority] = PublicKey.findProgramAddressSync(
//       [Buffer.from("__event_authority")],
//       METEORA_DAMM_PROGRAM
//     );

//     const tx = await program.methods
//       .initVault({
//         liquidity: new BN(1_000_000 * 1e9),
//         initialPrice: 1e8,
//       })
//       .preInstructions([
//         ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
//       ])
//       .accountsStrict({
//         maker: maker.publicKey,
//         vault: vaultPda,
//         gameTokenMint: gameTokenMint,
//         solMint: NATIVE_SOL_MINT,
//         config: config,
//         poolAuthority: poolAuthority,
//         dammPool: dammPoolPda,
//         positionNftMint: positionNftMint.publicKey,
//         positionNftAccount: positionNftAccount,
//         position: position,
//         tokenAVault: tokenAVault,
//         tokenBVault: tokenBVault,
//         payerTokenA: payerGameTokenAccount.address,
//         payerTokenB: payerSolTokenAccount.address,
//         pythPriceFeed: mockPythAccount.publicKey,
//         tokenAProgram: TOKEN_PROGRAM_ID,
//         tokenBProgram: TOKEN_PROGRAM_ID,
//         token2022Program: TOKEN_2022_PROGRAM_ID,
//         meteoraDammProgram: METEORA_DAMM_PROGRAM,
//         eventAuthority: eventAuthority,
//         systemProgram: SystemProgram.programId,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         rent: SYSVAR_RENT_PUBKEY,
//       })
//       .signers([maker, positionNftMint])
//       .rpc();

//     const vault = await program.account.vault.fetch(vaultPda);

//     expect(vault.authority.toString()).to.equal(maker.publicKey.toString());

//     console.log("\nTest 6: Vault authority verified");
//     console.log("Authority:", vault.authority.toString());
//     console.log("TX:", tx);
//   });

//   it("init_vault emits VaultInitialized event with correct data", async () => {
//     const gameTokenMint = await createMint(
//       provider.connection,
//       maker,
//       maker.publicKey,
//       null,
//       9
//     );

//     const [vaultPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("vault"), gameTokenMint.toBuffer(), NATIVE_SOL_MINT.toBuffer()],
//       program.programId
//     );

//     const config = METEORA_CONFIG_PDA;
//     const maxKey = gameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0
//       ? gameTokenMint
//       : NATIVE_SOL_MINT;
//     const minKey = gameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0
//       ? NATIVE_SOL_MINT
//       : gameTokenMint;

//     const [dammPoolPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("pool"), config.toBuffer(), maxKey.toBuffer(), minKey.toBuffer()],
//       METEORA_DAMM_PROGRAM
//     );

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

//     await mintTo(
//       provider.connection,
//       maker,
//       gameTokenMint,
//       payerGameTokenAccount.address,
//       maker,
//       gameTokenAmount.toNumber()
//     );

//     const wrapTx = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: maker.publicKey,
//         toPubkey: payerSolTokenAccount.address,
//         lamports: solAmountLamports,
//       }),
//       createSyncNativeInstruction(payerSolTokenAccount.address)
//     );

//     await sendAndConfirmTransaction(provider.connection, wrapTx, [maker]);

//     const [poolAuthority] = PublicKey.findProgramAddressSync(
//       [Buffer.from("pool_authority")],
//       METEORA_DAMM_PROGRAM
//     );

//     const [eventAuthority] = PublicKey.findProgramAddressSync(
//       [Buffer.from("__event_authority")],
//       METEORA_DAMM_PROGRAM
//     );

//     const listener = program.addEventListener("vaultInitialized", (event, slot) => {
//       console.log("\nTest 7: VaultInitialized event emitted");
//       console.log("Event data:", event);
//       console.log("Slot:", slot);
//     });

//     const tx = await program.methods
//       .initVault({
//         liquidity: new BN(1_000_000 * 1e9),
//         initialPrice: 1e8,
//       })
//       .preInstructions([
//         ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
//       ])
//       .accountsStrict({
//         maker: maker.publicKey,
//         vault: vaultPda,
//         gameTokenMint: gameTokenMint,
//         solMint: NATIVE_SOL_MINT,
//         config: config,
//         poolAuthority: poolAuthority,
//         dammPool: dammPoolPda,
//         positionNftMint: positionNftMint.publicKey,
//         positionNftAccount: positionNftAccount,
//         position: position,
//         tokenAVault: tokenAVault,
//         tokenBVault: tokenBVault,
//         payerTokenA: payerGameTokenAccount.address,
//         payerTokenB: payerSolTokenAccount.address,
//         pythPriceFeed: mockPythAccount.publicKey,
//         tokenAProgram: TOKEN_PROGRAM_ID,
//         tokenBProgram: TOKEN_PROGRAM_ID,
//         token2022Program: TOKEN_2022_PROGRAM_ID,
//         meteoraDammProgram: METEORA_DAMM_PROGRAM,
//         eventAuthority: eventAuthority,
//         systemProgram: SystemProgram.programId,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         rent: SYSVAR_RENT_PUBKEY,
//       })
//       .signers([maker, positionNftMint])
//       .rpc();

//     await new Promise(resolve => setTimeout(resolve, 2000));

//     await program.removeEventListener(listener);

//     expect(tx).to.be.a("string");
//     console.log("TX:", tx);
//   });

//   it("init_vault creates vault with correct PDA seeds and bump", async () => {
//     const gameTokenMint = await createMint(
//       provider.connection,
//       maker,
//       maker.publicKey,
//       null,
//       9
//     );

//     const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
//       [Buffer.from("vault"), gameTokenMint.toBuffer(), NATIVE_SOL_MINT.toBuffer()],
//       program.programId
//     );

//     const config = METEORA_CONFIG_PDA;
//     const maxKey = gameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0
//       ? gameTokenMint
//       : NATIVE_SOL_MINT;
//     const minKey = gameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0
//       ? NATIVE_SOL_MINT
//       : gameTokenMint;

//     const [dammPoolPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from("pool"), config.toBuffer(), maxKey.toBuffer(), minKey.toBuffer()],
//       METEORA_DAMM_PROGRAM
//     );

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

//     await mintTo(
//       provider.connection,
//       maker,
//       gameTokenMint,
//       payerGameTokenAccount.address,
//       maker,
//       gameTokenAmount.toNumber()
//     );

//     const wrapTx = new Transaction().add(
//       SystemProgram.transfer({
//         fromPubkey: maker.publicKey,
//         toPubkey: payerSolTokenAccount.address,
//         lamports: solAmountLamports,
//       }),
//       createSyncNativeInstruction(payerSolTokenAccount.address)
//     );

//     await sendAndConfirmTransaction(provider.connection, wrapTx, [maker]);

//     const [poolAuthority] = PublicKey.findProgramAddressSync(
//       [Buffer.from("pool_authority")],
//       METEORA_DAMM_PROGRAM
//     );

//     const [eventAuthority] = PublicKey.findProgramAddressSync(
//       [Buffer.from("__event_authority")],
//       METEORA_DAMM_PROGRAM
//     );

//     const tx = await program.methods
//       .initVault({
//         liquidity: new BN(1_000_000 * 1e9),
//         initialPrice: 1e8,
//       })
//       .preInstructions([
//         ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
//       ])
//       .accountsStrict({
//         maker: maker.publicKey,
//         vault: vaultPda,
//         gameTokenMint: gameTokenMint,
//         solMint: NATIVE_SOL_MINT,
//         config: config,
//         poolAuthority: poolAuthority,
//         dammPool: dammPoolPda,
//         positionNftMint: positionNftMint.publicKey,
//         positionNftAccount: positionNftAccount,
//         position: position,
//         tokenAVault: tokenAVault,
//         tokenBVault: tokenBVault,
//         payerTokenA: payerGameTokenAccount.address,
//         payerTokenB: payerSolTokenAccount.address,
//         pythPriceFeed: mockPythAccount.publicKey,
//         tokenAProgram: TOKEN_PROGRAM_ID,
//         tokenBProgram: TOKEN_PROGRAM_ID,
//         token2022Program: TOKEN_2022_PROGRAM_ID,
//         meteoraDammProgram: METEORA_DAMM_PROGRAM,
//         eventAuthority: eventAuthority,
//         systemProgram: SystemProgram.programId,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         rent: SYSVAR_RENT_PUBKEY,
//       })
//       .signers([maker, positionNftMint])
//       .rpc();

//     const vault = await program.account.vault.fetch(vaultPda);
//     const vaultAccountInfo = await provider.connection.getAccountInfo(vaultPda);

//     expect(vaultAccountInfo).to.not.be.null;
//     expect(vaultAccountInfo!.owner.toString()).to.equal(program.programId.toString());

//     console.log("\nTest 8: PDA derivation verified");
//     console.log("Vault PDA:", vaultPda.toString());
//     console.log("Vault Bump:", vaultBump);
//     console.log("Seeds: [vault, game_token_mint, sol_mint]");
//     console.log("TX:", tx);
//   });
// });
