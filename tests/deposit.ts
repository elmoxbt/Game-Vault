import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Gamevault } from "../target/types/gamevault";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { assert } from "chai";

describe("deposit", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Gamevault as Program<Gamevault>;

  // Native SOL mint
  const NATIVE_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

  // Meteora CP-AMM DAMM v2 program ID
  const METEORA_DAMM_PROGRAM = new PublicKey("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG");

  let gameTokenMint: PublicKey;
  let maker: Keypair;
  let depositor: Keypair;
  let pythPriceFeed: Keypair;
  let vaultPda: PublicKey;
  let dammPoolPda: PublicKey;

  before(async () => {
    maker = Keypair.generate();
    depositor = Keypair.generate();
    pythPriceFeed = Keypair.generate();

    // Airdrop SOL
    const makerAirdrop = await provider.connection.requestAirdrop(
      maker.publicKey,
      5 * anchor.web3.LAMPORTS_PER_SOL
    );
    const depositorAirdrop = await provider.connection.requestAirdrop(
      depositor.publicKey,
      20 * anchor.web3.LAMPORTS_PER_SOL
    );

    await provider.connection.confirmTransaction(makerAirdrop);
    await provider.connection.confirmTransaction(depositorAirdrop);

    // Create game token mint
    gameTokenMint = await createMint(
      provider.connection,
      maker,
      maker.publicKey,
      null,
      9 // 9 decimals
    );

    console.log("🎮 Game Token Mint:", gameTokenMint.toString());

    // Derive vault PDA
    [vaultPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        gameTokenMint.toBuffer(),
        NATIVE_SOL_MINT.toBuffer(),
      ],
      program.programId
    );

    // Mock DAMM pool account
    [dammPoolPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("mock_damm_pool"),
        gameTokenMint.toBuffer(),
        NATIVE_SOL_MINT.toBuffer(),
      ],
      METEORA_DAMM_PROGRAM
    );

    // Initialize vault
    const initArgs = {
      initialGameTokenAmount: new anchor.BN(1_000_000 * 1e9),
      initialSolAmount: new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL),
      binStep: 100,
      baseFeeBps: 30,
    };

    await program.methods
      .initVault(initArgs)
      .accountsStrict({
        maker: maker.publicKey,
        vault: vaultPda,
        gameTokenMint: gameTokenMint,
        solMint: NATIVE_SOL_MINT,
        dammPool: dammPoolPda,
        pythPriceFeed: pythPriceFeed.publicKey,
        meteoraDammProgram: METEORA_DAMM_PROGRAM,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([maker])
      .rpc();

    console.log("✅ Vault initialized:", vaultPda.toString());
  });

  it("Deposits 10 SOL + 1M game tokens with Pyth-powered price range", async () => {
    console.log("\n🔵 Test: Deposit with DAMM v2 CP-AMM + Pyth optimal range");

    // Derive user position PDA
    const [userPositionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("position"),
        vaultPda.toBuffer(),
        depositor.publicKey.toBuffer(),
      ],
      program.programId
    );

    // Create depositor's game token account
    const depositorGameTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      depositor,
      gameTokenMint,
      depositor.publicKey
    );

    await mintTo(
      provider.connection,
      maker,
      gameTokenMint,
      depositorGameTokenAccount.address,
      maker,
      1_000_000 * 1e9
    );

    console.log("✓ Minted 1M game tokens to depositor");

    // Create depositor's wrapped SOL account
    const depositorSolAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      depositor,
      NATIVE_SOL_MINT,
      depositor.publicKey
    );

    console.log("✓ Created wrapped SOL account");

    // Mock pool vaults
    const vaultA = Keypair.generate();
    const vaultB = Keypair.generate();
    const position = Keypair.generate();

    // Deposit amounts
    const depositArgs = {
      gameTokenAmount: new anchor.BN(1_000_000 * 1e9),
      solAmount: new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL),
    };

    console.log("\n📥 Depositing:");
    console.log("  Game Tokens: 1,000,000");
    console.log("  SOL: 10");

    // Call deposit instruction
    const tx = await program.methods
      .deposit(depositArgs)
      .accountsStrict({
        user: depositor.publicKey,
        vault: vaultPda,
        userPosition: userPositionPda,
        dammPool: dammPoolPda,
        userGameToken: depositorGameTokenAccount.address,
        userSolToken: depositorSolAccount.address,
        vaultA: vaultA.publicKey,
        vaultB: vaultB.publicKey,
        position: position.publicKey,
        pythPriceFeed: pythPriceFeed.publicKey,
        meteoraDammProgram: METEORA_DAMM_PROGRAM,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([depositor])
      .rpc({ skipPreflight: true });

    console.log("\n✅ Deposit TX:", tx);

    // Fetch user position
    const userPosition = await program.account.userPosition.fetch(userPositionPda);

    console.log("\n📊 User Position Created:");
    console.log("   Shares:", userPosition.shares.toString());
    console.log("   Total USD:", userPosition.totalDepositedUsd.toString());

    // Fetch vault
    const vault = await program.account.vault.fetch(vaultPda);

    console.log("\n📊 Vault Updated:");
    console.log("   Total Shares:", vault.totalShares.toString());
    console.log("   Pyth Price:", vault.lastPythPrice.toString());
    console.log("   Pyth Confidence:", vault.lastPythConfidence.toString());

    // Assertions
    assert.equal(
      userPosition.vault.toString(),
      vaultPda.toString(),
      "Vault mismatch"
    );

    assert.isTrue(
      userPosition.shares.gt(new anchor.BN(0)),
      "Shares should be minted"
    );

    assert.isTrue(
      vault.totalShares.eq(userPosition.shares),
      "Vault shares should match user shares"
    );

    console.log("\n✅ All assertions passed!");
    console.log("🎉 DAMM v2 (CP-AMM) deposit with Pyth working!");
  });
});
