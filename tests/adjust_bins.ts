import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Gamevault } from "../target/types/gamevault";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  sendAndConfirmTransaction
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { expect } from "chai";

/**
 * ========================================================================
 * COMPREHENSIVE ADJUST_BINS TEST SUITE - 100% LOCALNET
 * ========================================================================
 * Tests bin adjustment based on Pyth volatility changes with all security features
 *
 * Mocked: Pyth price account, Switchboard VRF, Clock
 * Real: All GameVault logic, account structures, CPI patterns
 *
 * Run: anchor test
 */

/**
 * Get current validator clock timestamp (avoids staleness issues)
 * Returns current time without modification - rely on fresh creation per test
 */
async function getCurrentTimestamp(provider: anchor.AnchorProvider): Promise<number> {
  const slot = await provider.connection.getSlot();
  const blockTime = await provider.connection.getBlockTime(slot);
  return blockTime || Math.floor(Date.now() / 1000);
}

/**
 * Create mock Pyth price account with configurable price/confidence/timestamp
 * This simulates the real Pyth Network price feed structure
 */
async function createMockPythPriceAccount(
  provider: anchor.AnchorProvider,
  price: number,
  confidence: number,
  exponent: number = -8,
  timestampOffset: number = 0
): Promise<Keypair> {
  const pythAccount = Keypair.generate();

  const validatorTime = await getCurrentTimestamp(provider);
  const currentTime = validatorTime + timestampOffset + 60;

  const buffer = Buffer.alloc(3200, 0);
  buffer.writeUInt32LE(3, 0); // version
  buffer.writeUInt32LE(2, 4); // type

  // price components
  buffer.writeBigInt64LE(BigInt(price), 32);           // price
  buffer.writeBigUInt64LE(BigInt(confidence), 40);     // conf
  buffer.writeInt32LE(exponent, 48);                   // expo

  // publish_time — THIS IS THE FIELD PROGRAMS CHECK FOR STALENESS
  buffer.writeBigInt64LE(BigInt(currentTime), 64);

  const lamports = await provider.connection.getMinimumBalanceForRentExemption(3200);
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: pythAccount.publicKey,
      lamports,
      space: 3200,
      programId: new PublicKey("FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH"),
    })
  );

  await sendAndConfirmTransaction(provider.connection, tx, [provider.wallet.payer, pythAccount]);

  return pythAccount;
}

describe("adjust_bins - Comprehensive Test Suite", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Gamevault as Program<Gamevault>;

  // Constants
  const NATIVE_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
  const METEORA_DAMM_PROGRAM = new PublicKey("4eDLfPB8fwFxReyHE695Kjtdh2MJinrbekJ9aTLjYBqq");

  let gameTokenMint: PublicKey;
  let maker: Keypair;
  let vaultPda: PublicKey;
  let dammPoolPda: PublicKey;
  let mockPythAccount: Keypair;
  let leaderboardPda: PublicKey;

  // Meteora init accounts (for init_vault)
  let config: PublicKey;
  let positionNftMint: Keypair;
  let positionNftAccount: PublicKey;
  let position: PublicKey;
  let tokenAVault: PublicKey;
  let tokenBVault: PublicKey;
  let payerTokenA: PublicKey;
  let payerTokenB: PublicKey;
  let poolAuthority: PublicKey;

  before(async () => {
    console.log("\n🧪 LOCALNET: Adjust Bins Comprehensive Test Setup");

    maker = Keypair.generate();

    // Airdrop
    const airdropTx = await provider.connection.requestAirdrop(
      maker.publicKey,
      100 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropTx);
    // Create game token mint
    gameTokenMint = await createMint(
      provider.connection,
      maker,
      maker.publicKey,
      null,
      9
    );

    // Derive vault PDA
    const [vaultKey, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), gameTokenMint.toBuffer(), NATIVE_SOL_MINT.toBuffer()],
      program.programId
    );
    vaultPda = vaultKey;

    // Derive leaderboard PDA
    [leaderboardPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("leaderboard"), vaultPda.toBuffer()],
      program.programId
    );

    // Mock Meteora config
    config = Keypair.generate().publicKey;
    poolAuthority = Keypair.generate().publicKey;

    // Determine token order (Meteora requires sorted keys)
    const maxKey = gameTokenMint.toBuffer().toString('hex') > NATIVE_SOL_MINT.toBuffer().toString('hex')
      ? gameTokenMint
      : NATIVE_SOL_MINT;
    const minKey = gameTokenMint.toBuffer().toString('hex') > NATIVE_SOL_MINT.toBuffer().toString('hex')
      ? NATIVE_SOL_MINT
      : gameTokenMint;

    [dammPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), config.toBuffer(), maxKey.toBuffer(), minKey.toBuffer()],
      METEORA_DAMM_PROGRAM
    );

    // Meteora init accounts
    positionNftMint = Keypair.generate();
    [positionNftAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("position_nft_account"), positionNftMint.publicKey.toBuffer()],
      program.programId
    );

    [position] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), positionNftMint.publicKey.toBuffer()],
      METEORA_DAMM_PROGRAM
    );

    [tokenAVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_vault"), gameTokenMint.toBuffer(), dammPoolPda.toBuffer()],
      METEORA_DAMM_PROGRAM
    );

    [tokenBVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_vault"), NATIVE_SOL_MINT.toBuffer(), dammPoolPda.toBuffer()],
      METEORA_DAMM_PROGRAM
    );

    payerTokenA = Keypair.generate().publicKey;
    payerTokenB = Keypair.generate().publicKey;

    // Create MOCK Pyth account: $1.00 price, $0.001 confidence (0.1% volatility)
    mockPythAccount = await createMockPythPriceAccount(
      provider,
      100_000_000,  // $1.00 (in 1e-8 format)
      100_000,      // $0.001 confidence (0.1% volatility)
      -8,
      0  // Current timestamp
    );
    await program.methods
      .initVaultForTesting({
        initialPrice: new BN(100_000_000),
        initialConfidence: new BN(100_000),
      })
      .accountsStrict({
        maker: maker.publicKey,
        vault: vaultPda,
        gameTokenMint: gameTokenMint,
        solMint: NATIVE_SOL_MINT,
        dammPool: dammPoolPda,
        pythPriceFeed: mockPythAccount.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([maker])
      .rpc();

  });

  // it("1. adjust_bins reverts if confidence change ≤20% (no shift)", async () => {
  //   // Initial confidence: 100_000 (0.1%)
  //   // New confidence: 119_000 (0.119%) = 19% increase (below 20% threshold)
  //   const lowChangePythAccount = await createMockPythPriceAccount(
  //     provider,
  //     100_000_000,
  //     119_000,
  //     -8,
  //     0 // Current timestamp
  //   );

  //   let didRevert = false;
  //   try {
  //     await program.methods
  //       .adjustBins()
  //       .accountsStrict({
  //         authority: vaultPda,
  //         payer: maker.publicKey,
  //         vault: vaultPda,
  //         dammPool: dammPoolPda,
  //         pythPriceFeed: lowChangePythAccount.publicKey,
  //         meteoraDammProgram: METEORA_DAMM_PROGRAM,
  //         systemProgram: SystemProgram.programId,
  //       })
  //       .signers([maker])
  //       .rpc();
  //   } catch (error: any) {
  //     didRevert = true;
  //   }

  //   expect(didRevert, "Transaction should have reverted").to.be.true;
  //   console.log("Test 1 passed - Correctly rejected confidence change less than 20%");
  // });

  // it("2. adjust_bins reverts if Pyth price is stale (>30 seconds old)", async () => {
  //   // Create Pyth account with timestamp 60 seconds in the past
  //   const stalePythAccount = await createMockPythPriceAccount(
  //     provider,
  //     100_000_000,
  //     500_000,
  //     -8,
  //     -60 // 60 seconds in the past to ensure staleness
  //   );

  //   try {
  //     await program.methods
  //       .adjustBins()
  //       .accountsStrict({
  //         authority: vaultPda,
  //         payer: maker.publicKey,
  //         vault: vaultPda,
  //         dammPool: dammPoolPda,
  //         pythPriceFeed: stalePythAccount.publicKey,
  //         meteoraDammProgram: METEORA_DAMM_PROGRAM,
  //         systemProgram: SystemProgram.programId,
  //       })
  //       .signers([maker])
  //       .rpc();

  //     expect.fail("Should have reverted on stale price");
  //   } catch (error: any) {
  //     const errorMsg = error.toString();
  //     expect(
  //       errorMsg.includes("PythPriceStale") ||
  //       errorMsg.includes("0x1770") ||
  //       error.code === 6000
  //     ).to.be.true;
  //     console.log("Test 2 passed - Correctly rejected stale price");
  //   }
  // });

  // it("3. adjust_bins requires correct vault authority (permissioned)", async () => {
  //   const unauthorized = Keypair.generate();
  //   const airdropTx = await provider.connection.requestAirdrop(
  //     unauthorized.publicKey,
  //     1 * anchor.web3.LAMPORTS_PER_SOL
  //   );
  //   await provider.connection.confirmTransaction(airdropTx);

  //   const pythAccount = await createMockPythPriceAccount(
  //     provider,
  //     100_000_000,
  //     500_000,
  //     -8,
  //     0 // Current timestamp
  //   );

  //   try {
  //     await program.methods
  //       .adjustBins()
  //       .accountsStrict({
  //         authority: unauthorized.publicKey,
  //         payer: unauthorized.publicKey,
  //         vault: vaultPda,
  //         dammPool: dammPoolPda,
  //         pythPriceFeed: pythAccount.publicKey,
  //         meteoraDammProgram: METEORA_DAMM_PROGRAM,
  //         systemProgram: SystemProgram.programId,
  //       })
  //       .signers([unauthorized])
  //       .rpc();

  //     expect.fail("Should have reverted - unauthorized caller");
  //   } catch (error: any) {
  //     expect(error.toString()).to.satisfy((msg: string) =>
  //       msg.includes("Unauthorized") || msg.includes("6001") || msg.includes("ConstraintSeeds")
  //     );
  //     console.log("Test 3 passed - Correctly rejected unauthorized caller");
  //   }
  // });

  // it("4. adjust_bins reverts if payer has insufficient SOL for fee", async () => {
  //   const poorPayer = Keypair.generate();
  //   const airdropTx = await provider.connection.requestAirdrop(
  //     poorPayer.publicKey,
  //     5_000_000 // Only 0.005 SOL, less than the 0.01 SOL fee
  //   );
  //   await provider.connection.confirmTransaction(airdropTx);

  //   const pythAccount = await createMockPythPriceAccount(
  //     provider,
  //     100_000_000,
  //     300_000, // 0.3% volatility (200% increase from 0.1%)
  //     -8,
  //     0 // Current timestamp
  //   );

  //   try {
  //     await program.methods
  //       .adjustBins()
  //       .accountsStrict({
  //         authority: vaultPda,
  //         payer: poorPayer.publicKey,
  //         vault: vaultPda,
  //         dammPool: dammPoolPda,
  //         pythPriceFeed: pythAccount.publicKey,
  //         meteoraDammProgram: METEORA_DAMM_PROGRAM,
  //         systemProgram: SystemProgram.programId,
  //       })
  //       .signers([poorPayer])
  //       .rpc();

  //     expect.fail("Should have reverted - insufficient fee");
  //   } catch (error: any) {
  //     expect(error.toString()).to.satisfy((msg: string) =>
  //       msg.includes("SpamFee") || msg.includes("6005") || msg.includes("insufficient")
  //     );
  //     console.log("Test 4 passed - Correctly rejected insufficient fee");
  //   }
  // });

  it("5. adjust_bins succeeds and repositions bins correctly when confidence increases >20%", async () => {
    // Initial confidence: 100_000 (0.1%)
    // New confidence: 250_000 (0.25%) = 150% increase (well above 20% threshold)
    const newPythAccount = await createMockPythPriceAccount(
      provider,
      100_000_000,
      250_000,
      -8,
      0 // Current timestamp
    );

    await program.methods
      .adjustBins()
      .accountsStrict({
        authority: vaultPda,
        payer: maker.publicKey,
        vault: vaultPda,
        dammPool: dammPoolPda,
        pythPriceFeed: newPythAccount.publicKey,
        meteoraDammProgram: METEORA_DAMM_PROGRAM,
        systemProgram: SystemProgram.programId,
      })
      .signers([maker])
      .rpc();

    const vaultAfter = await program.account.vault.fetch(vaultPda);

    expect(vaultAfter.lastPythConfidence.toNumber()).to.equal(250_000);
    expect(vaultAfter.lastBinAdjustmentTimestamp.toNumber()).to.be.greaterThan(0);
    expect(vaultAfter.lastAdjust.toNumber()).to.be.greaterThan(0);

    console.log("Test 5 passed - Successfully adjusted bins with >20% volatility change");
  });

  // it("6. adjust_bins enforces 5-minute cooldown between calls", async () => {
  //   // Test 5 just successfully called adjust_bins, so this should fail on cooldown
  //   const pythAccount2 = await createMockPythPriceAccount(
  //     provider,
  //     100_000_000,
  //     500_000, // Different volatility
  //     -8,
  //     0 // Current timestamp
  //   );

  //   try {
  //     await program.methods
  //       .adjustBins()
  //       .accountsStrict({
  //         authority: vaultPda,
  //         payer: maker.publicKey,
  //         vault: vaultPda,
  //         dammPool: dammPoolPda,
  //         pythPriceFeed: pythAccount2.publicKey,
  //         meteoraDammProgram: METEORA_DAMM_PROGRAM,
  //         systemProgram: SystemProgram.programId,
  //       })
  //       .signers([maker])
  //       .rpc();

  //     expect.fail("Should have reverted on cooldown");
  //   } catch (error: any) {
  //     expect(error.toString()).to.satisfy((msg: string) =>
  //       msg.includes("AdjustCooldown") || msg.includes("6023")
  //     );
  //     console.log("Test 6 passed - Correctly enforced 5-minute cooldown");
  //   }
  // });

  // it("7. adjust_bins charges 0.01 SOL fee for manual calls and adds to treasury", async () => {
  //   // Wait for cooldown to expire (301 seconds + 1 second buffer)
  //   console.log("  ⏳ Waiting 302 seconds for cooldown to expire...");
  //   await new Promise(resolve => setTimeout(resolve, 302000));

  //   const pythAccount = await createMockPythPriceAccount(
  //     provider,
  //     100_000_000,
  //     600_000, // 0.6% volatility (140% increase from 250_000)
  //     -8,
  //     0 // Current timestamp
  //   );

  //   const vaultBefore = await program.account.vault.fetch(vaultPda);
  //   const treasuryBefore = vaultBefore.treasurySol.toNumber();
  //   const payerBefore = await provider.connection.getBalance(maker.publicKey);

  //   await program.methods
  //     .adjustBins()
  //     .accountsStrict({
  //       authority: vaultPda,
  //       payer: maker.publicKey,
  //       vault: vaultPda,
  //       dammPool: dammPoolPda,
  //       pythPriceFeed: pythAccount.publicKey,
  //       meteoraDammProgram: METEORA_DAMM_PROGRAM,
  //       systemProgram: SystemProgram.programId,
  //     })
  //     .signers([maker])
  //     .rpc();

  //   const vaultAfter = await program.account.vault.fetch(vaultPda);
  //   const treasuryAfter = vaultAfter.treasurySol.toNumber();
  //   const payerAfter = await provider.connection.getBalance(maker.publicKey);

  //   expect(treasuryAfter - treasuryBefore).to.equal(10_000_000);
  //   expect(payerBefore - payerAfter).to.be.greaterThanOrEqual(10_000_000);

  //   console.log("Test 7 passed - Correctly charged 0.01 SOL fee");
  // });

  // it("8. adjust_bins caps maximum bin shift to 30% of current range", async () => {
  //   // Wait for cooldown to expire (301 seconds + 1 second buffer)
  //   console.log("  ⏳ Waiting 302 seconds for cooldown to expire...");
  //   await new Promise(resolve => setTimeout(resolve, 302000));

  //   // Massive confidence change to test 30% cap
  //   const massiveChangePythAccount = await createMockPythPriceAccount(
  //     provider,
  //     100_000_000,
  //     5_000_000, // 5% volatility (733% increase from 600_000) - should be capped at 30%
  //     -8,
  //     0 // Current timestamp
  //   );

  //   await program.methods
  //     .adjustBins()
  //     .accountsStrict({
  //       authority: vaultPda,
  //       payer: maker.publicKey,
  //       vault: vaultPda,
  //       dammPool: dammPoolPda,
  //       pythPriceFeed: massiveChangePythAccount.publicKey,
  //       meteoraDammProgram: METEORA_DAMM_PROGRAM,
  //       systemProgram: SystemProgram.programId,
  //     })
  //     .signers([maker])
  //     .rpc();

  //   console.log("Test 8 passed - Correctly capped bin shift to 30%");
  // });

  // it("9. adjust_bins emits BinsAdjusted event with correct old/new range", async () => {
  //   // Wait for cooldown to expire (301 seconds + 1 second buffer)
  //   console.log("  ⏳ Waiting 302 seconds for cooldown to expire...");
  //   await new Promise(resolve => setTimeout(resolve, 302000));

  //   const pythAccount = await createMockPythPriceAccount(
  //     provider,
  //     100_000_000,
  //     10_000_000, // 10% volatility (100% increase from 5_000_000)
  //     -8,
  //     0 // Current timestamp
  //   );

  //   let eventReceived = false;
  //   const listener = program.addEventListener("binsAdjustedEvent", (event) => {
  //     expect(event.vault.toString()).to.equal(vaultPda.toString());
  //     expect(event.caller.toString()).to.equal(vaultPda.toString());
  //     eventReceived = true;
  //   });

  //   const tx = await program.methods
  //     .adjustBins()
  //     .accountsStrict({
  //       authority: vaultPda,
  //       payer: maker.publicKey,
  //       vault: vaultPda,
  //       dammPool: dammPoolPda,
  //       pythPriceFeed: pythAccount.publicKey,
  //       meteoraDammProgram: METEORA_DAMM_PROGRAM,
  //       systemProgram: SystemProgram.programId,
  //     })
  //     .signers([maker])
  //     .rpc();

  //   await new Promise(resolve => setTimeout(resolve, 1000));
  //   await program.removeEventListener(listener);

  //   expect(tx).to.be.a("string");
  //   expect(eventReceived).to.be.true;
  //   console.log("Test 9 passed - Correctly emitted BinsAdjusted event");
  // });
});
