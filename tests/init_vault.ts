import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Gamevault } from "../target/types/gamevault";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { assert } from "chai";

describe("init_vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Gamevault as Program<Gamevault>;

  // Native SOL mint
  const NATIVE_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

  // Mock Meteora DAMM program ID (devnet)
  const METEORA_DAMM_PROGRAM = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");

  let gameTokenMint: PublicKey;
  let maker: Keypair;
  let pythPriceFeed: Keypair;

  before(async () => {
    maker = Keypair.generate();
    pythPriceFeed = Keypair.generate();

    // Airdrop SOL to maker
    const airdropSig = await provider.connection.requestAirdrop(
      maker.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Create game token mint (e.g., $RAID)
    gameTokenMint = await createMint(
      provider.connection,
      maker,
      maker.publicKey,
      null,
      9 // 9 decimals
    );

    console.log("Game Token Mint:", gameTokenMint.toString());
  });

  it("Creates a vault with DAMM pool", async () => {
    // Derive vault PDA
    const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        gameTokenMint.toBuffer(),
        NATIVE_SOL_MINT.toBuffer(),
      ],
      program.programId
    );

    console.log("Vault PDA:", vaultPda.toString());

    // Mock DAMM pool account (deterministic for testing)
    const [dammPoolPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("mock_damm_pool"),
        gameTokenMint.toBuffer(),
        NATIVE_SOL_MINT.toBuffer(),
      ],
      METEORA_DAMM_PROGRAM
    );

    // Instruction args
    const args = {
      initialGameTokenAmount: new anchor.BN(1_000_000 * 1e9), // 1M tokens
      initialSolAmount: new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL), // 10 SOL
      binStep: 100, // 1% per bin
      baseFeeBps: 30, // 0.3% trading fee
    };

    // Call init_vault
    const tx = await program.methods
      .initVault(args)
      .accounts({
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

    console.log("Init Vault TX:", tx);

    // Fetch and verify vault account
    const vaultAccount = await program.account.vault.fetch(vaultPda);

    console.log("\n✅ Vault Created:");
    console.log("   Authority:", vaultAccount.authority.toString());
    console.log("   Game Token Mint:", vaultAccount.gameTokenMint.toString());
    console.log("   SOL Mint:", vaultAccount.solMint.toString());
    console.log("   DAMM Pool:", vaultAccount.dammPool.toString());
    console.log("   Total Shares:", vaultAccount.totalShares.toString());
    console.log("   Last Pyth Price:", vaultAccount.lastPythPrice.toString());
    console.log("   Last Confidence:", vaultAccount.lastPythConfidence.toString());
    console.log("   Bump:", vaultAccount.bump);

    // Assertions
    assert.equal(
      vaultAccount.authority.toString(),
      program.programId.toString(),
      "Authority should be program ID"
    );

    assert.equal(
      vaultAccount.gameTokenMint.toString(),
      gameTokenMint.toString(),
      "Game token mint mismatch"
    );

    assert.equal(
      vaultAccount.solMint.toString(),
      NATIVE_SOL_MINT.toString(),
      "SOL mint mismatch"
    );

    assert.notEqual(
      vaultAccount.dammPool.toString(),
      PublicKey.default.toString(),
      "DAMM pool should be initialized"
    );

    assert.equal(
      vaultAccount.dammPool.toString(),
      dammPoolPda.toString(),
      "DAMM pool address mismatch"
    );

    assert.equal(
      vaultAccount.totalShares.toNumber(),
      0,
      "Initial shares should be 0"
    );

    assert.equal(
      vaultAccount.bump,
      vaultBump,
      "Bump seed mismatch"
    );

    // Price should be mock values from stub
    assert.equal(
      vaultAccount.lastPythPrice.toString(),
      "100000000", // $100
      "Initial price mismatch"
    );

    console.log("\n✅ All assertions passed!");
  });
});
