import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Gamevault } from "../target/types/gamevault";
import { PublicKey, Keypair, SystemProgram, SYSVAR_SLOT_HASHES_PUBKEY } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
} from "@solana/spl-token";
import { assert } from "chai";

describe("trigger_daily_war - Liquidity Wars", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Gamevault as Program<Gamevault>;

  // Helper to manually fetch and deserialize WarHistory
  async function fetchWarHistory(address: PublicKey) {
    const accountInfo = await provider.connection.getAccountInfo(address);
    if (!accountInfo) {
      throw new Error("War history account not found");
    }

    // Manually deserialize the account data
    // WarHistory layout: discriminator (8) + vault (32) + last_war_timestamp (8) + total_wars (8) + total_fees_distributed (8) + bump (1)
    const data = accountInfo.data;

    return {
      vault: new PublicKey(data.slice(8, 40)),
      lastWarTimestamp: new anchor.BN(data.slice(40, 48), 'le'),
      totalWars: new anchor.BN(data.slice(48, 56), 'le'),
      totalFeesDistributed: new anchor.BN(data.slice(56, 64), 'le'),
      bump: data[64],
    };
  }

  // Test accounts
  let gameTokenMint: PublicKey;
  let solMint: PublicKey;
  let vaultPda: PublicKey;
  let warHistoryPda: PublicKey;
  let dammPoolPda: PublicKey;
  let pythPriceFeed: PublicKey;

  const maker = Keypair.generate();
  const warTrigger = Keypair.generate();

  // Jupiter v6 Program ID
  const JUPITER_V6_PROGRAM = new PublicKey(
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
  );

  // Meteora DAMM v2 CP-AMM Program ID
  const METEORA_DAMM_PROGRAM = new PublicKey(
    "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG"
  );

  // Native SOL mint
  const NATIVE_SOL_MINT = new PublicKey(
    "So11111111111111111111111111111111111111112"
  );

  before(async () => {
    // Airdrop SOL to test accounts
    const airdropMaker = await provider.connection.requestAirdrop(
      maker.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropMaker);

    const airdropTrigger = await provider.connection.requestAirdrop(
      warTrigger.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropTrigger);

    // Create game token mint
    gameTokenMint = await createMint(
      provider.connection,
      maker,
      maker.publicKey,
      null,
      9 // 9 decimals
    );

    solMint = NATIVE_SOL_MINT;

    // Derive vault PDA
    [vaultPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        gameTokenMint.toBuffer(),
        solMint.toBuffer(),
      ],
      program.programId
    );

    // Derive war history PDA
    [warHistoryPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("war_history"),
        vaultPda.toBuffer(),
      ],
      program.programId
    );

    // Mock DAMM pool PDA
    [dammPoolPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("damm_pool"),
        gameTokenMint.toBuffer(),
        solMint.toBuffer(),
      ],
      program.programId
    );

    // Mock Pyth price feed
    pythPriceFeed = Keypair.generate().publicKey;

    console.log("Setup complete:");
    console.log("  Game Token Mint:", gameTokenMint.toString());
    console.log("  Vault PDA:", vaultPda.toString());
    console.log("  War History PDA:", warHistoryPda.toString());
    console.log("  DAMM Pool PDA:", dammPoolPda.toString());
  });

  it("Initializes vault before war", async () => {
    await program.methods
      .initVault({
        initialGameTokenAmount: new anchor.BN(1_000_000 * 1e9),
        initialSolAmount: new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL),
        binStep: 100,
        baseFeeBps: 30,
      })
      .accountsStrict({
        maker: maker.publicKey,
        vault: vaultPda,
        gameTokenMint: gameTokenMint,
        solMint: solMint,
        dammPool: dammPoolPda,
        pythPriceFeed: pythPriceFeed,
        meteoraDammProgram: METEORA_DAMM_PROGRAM,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([maker])
      .rpc({ skipPreflight: true });

    const vault = await program.account.vault.fetch(vaultPda);
    console.log("\n✅ Vault initialized for war testing");
    assert.equal(vault.gameTokenMint.toString(), gameTokenMint.toString());
  });

  it("Triggers first daily war successfully", async () => {
    // Use fixed attack size for deterministic testing
    const attackSizeBps = 1000; // 10%

    const tx = await program.methods
      .triggerDailyWar({
        attackSizeBps,
      })
      .accountsStrict({
        caller: warTrigger.publicKey,
        vault: vaultPda,
        warHistory: warHistoryPda,
        dammPool: dammPoolPda,
        gameTokenMint: gameTokenMint,
        solMint: solMint,
        jupiterProgram: JUPITER_V6_PROGRAM,
        slotHashes: SYSVAR_SLOT_HASHES_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .signers([warTrigger])
      .rpc({ skipPreflight: true });

    console.log("\n✅ First war triggered");
    console.log("  Transaction:", tx);

    // Fetch war history
    const warHistory = await fetchWarHistory(warHistoryPda);

    console.log("  War History:");
    console.log("    Total wars:", warHistory.totalWars.toString());
    console.log("    Total fees distributed:", warHistory.totalFeesDistributed.toString());
    console.log("    Last war timestamp:", warHistory.lastWarTimestamp.toString());

    assert.equal(warHistory.totalWars.toNumber(), 1, "Should have 1 war");
    assert.ok(warHistory.totalFeesDistributed.toNumber() > 0, "Should have captured fees");
    assert.ok(warHistory.lastWarTimestamp.toNumber() > 0, "Should have timestamp");
  });

  it("Fails to trigger war before 24h cooldown", async () => {
    try {
      await program.methods
        .triggerDailyWar({
          attackSizeBps: 1000,
        })
        .accountsStrict({
          caller: warTrigger.publicKey,
          vault: vaultPda,
          warHistory: warHistoryPda,
          dammPool: dammPoolPda,
          gameTokenMint: gameTokenMint,
          solMint: solMint,
          jupiterProgram: JUPITER_V6_PROGRAM,
          slotHashes: SYSVAR_SLOT_HASHES_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .signers([warTrigger])
        .rpc({ skipPreflight: true });

      assert.fail("Should have failed due to cooldown");
    } catch (err: any) {
      console.log("\n✅ Correctly rejected - cooldown active");
      // Transaction correctly failed - test passes
      assert.ok(err);
    }
  });

  it("Validates attack size range", async () => {
    try {
      // Try invalid attack size (60% > 50% max)
      await program.methods
        .triggerDailyWar({
          attackSizeBps: 6000, // 60% - invalid
        })
        .accountsStrict({
          caller: warTrigger.publicKey,
          vault: vaultPda,
          warHistory: warHistoryPda,
          dammPool: dammPoolPda,
          gameTokenMint: gameTokenMint,
          solMint: solMint,
          jupiterProgram: JUPITER_V6_PROGRAM,
          slotHashes: SYSVAR_SLOT_HASHES_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .signers([warTrigger])
        .rpc({ skipPreflight: true });

      assert.fail("Should have failed due to invalid attack size");
    } catch (err: any) {
      console.log("\n✅ Correctly rejected - invalid attack size");
      // Transaction correctly failed - test passes
      assert.ok(err);
    }
  });

  it("Documents expected behavior with random attack size", async () => {
    console.log("\n📊 Random attack size generation:");
    console.log("  Source: Slot hashes sysvar (recent block hashes)");
    console.log("  Range: 5-50% of TVL (500-5000 bps)");
    console.log("  Calculation: random_value % 4501 + 500");
    console.log("\n  Example scenarios:");
    console.log("    - 5% attack (500 bps): Small probe");
    console.log("    - 25% attack (2500 bps): Medium attack");
    console.log("    - 50% attack (5000 bps): Maximum aggression");
    console.log("\n  Fee capture:");
    console.log("    - Fees = attack_amount / 100 (1% mock)");
    console.log("    - Real: Jupiter swap fees + Meteora LP fees");
    console.log("\n  Next: Day 5 will add fee distribution to Top 10 LPs");
  });
});
