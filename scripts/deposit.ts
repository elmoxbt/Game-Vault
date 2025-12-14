import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Gamevault } from "../target/types/gamevault";
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Connection,
} from "@solana/web3.js";
import { expect } from "chai";
import * as fs from "fs";

// REAL DEVNET: Deposit liquidity into GameVault
// DEPLOYED PROGRAM: 5vdaPrsz1naFvdEAC9ePTTvnFeszhiqEDVuY1FhHejpi
// Cost: <0.01 SOL (deposit + rent)

const DEPLOYED_PROGRAM_ID = new PublicKey("9h99ZKZpprYZn2xaBEQC2R62BJCCYFMg7XEjTDzqAxk5");
const NATIVE_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const METEORA_DAMM_PROGRAM = new PublicKey("4eDLfPB8fwFxReyHE695Kjtdh2MJinrbekJ9aTLjYBqq");
const PYTH_SOL_USD_DEVNET = new PublicKey("H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG");

// REPLACE THESE WITH YOUR REAL VALUES FROM init_vault.ts
const GAME_TOKEN_MINT = new PublicKey("GvTLp1a1TTcEM1q8bW3vgzzzjQSxkFw3XeMAyme7999j");
const VAULT_PDA = new PublicKey("GowQtKtSsppWNM4Cd36t7y8wCxw6YbKrmNojsUWuXoip");
const DAMM_POOL_PDA = new PublicKey("BLijHkqiYBjknMkc7NmrASgskyjdmaSvcUxgwWjLCrEa");

// Meteora position NFT mint (from init_vault.ts output)
const POSITION_NFT_MINT = new PublicKey("YOUR_POSITION_NFT_MINT_HERE");

async function main() {
  // Load wallet from filesystem
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const walletPath = process.env.ANCHOR_WALLET || require("os").homedir() + "/.config/solana/id.json";
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const program = new Program(
    require("../target/idl/gamevault.json"),
    provider
  ) as Program<Gamevault>;

  console.log("\nREAL DEVNET: Depositing Liquidity");
  console.log("Program ID:", DEPLOYED_PROGRAM_ID.toString());
  console.log("User:", walletKeypair.publicKey.toString());

  const user = walletKeypair;

  // Derive PDAs
  const [userPositionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), VAULT_PDA.toBuffer(), user.publicKey.toBuffer()],
    DEPLOYED_PROGRAM_ID
  );

  const [leaderboardPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("leaderboard"), VAULT_PDA.toBuffer()],
    DEPLOYED_PROGRAM_ID
  );

  // Derive Meteora DAMM accounts (based on init_vault.ts structure)
  const [vaultA] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_vault"), GAME_TOKEN_MINT.toBuffer(), DAMM_POOL_PDA.toBuffer()],
    METEORA_DAMM_PROGRAM
  );

  const [vaultB] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_vault"), NATIVE_SOL_MINT.toBuffer(), DAMM_POOL_PDA.toBuffer()],
    METEORA_DAMM_PROGRAM
  );

  const [position] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), POSITION_NFT_MINT.toBuffer()],
    METEORA_DAMM_PROGRAM
  );

  // REAL: Get user token accounts
  const userGameToken = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    user,
    GAME_TOKEN_MINT,
    user.publicKey
  );

  const userSolToken = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    user,
    NATIVE_SOL_MINT,
    user.publicKey
  );

  const depositAmount = {
    gameTokenAmount: new BN(1_000_000 * 1e9), // 1M tokens
    solAmount: new BN(10 * anchor.web3.LAMPORTS_PER_SOL), // 10 SOL
  };

  console.log("\nDeposit Amount:");
  console.log("   Game Tokens: 1,000,000");
  console.log("   SOL: 10");

  // REAL DEVNET: Execute deposit
  try {
    const tx = await program.methods
      .deposit(depositAmount)
      .accountsStrict({
        user: user.publicKey,
        vault: VAULT_PDA,
        userPosition: userPositionPda,
        leaderboard: leaderboardPda,
        dammPool: DAMM_POOL_PDA,
        userGameToken: userGameToken.address,
        userSolToken: userSolToken.address,
        vaultA: vaultA,
        vaultB: vaultB,
        position: position,
        pythPriceFeed: PYTH_SOL_USD_DEVNET,
        meteoraDammProgram: METEORA_DAMM_PROGRAM,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([user])
      .rpc();

    console.log("\nREAL TX:", tx);
    console.log(`https://solscan.io/tx/${tx}?cluster=devnet`);

    // REAL: Fetch position state
    const userPosition = await program.account.userPosition.fetch(userPositionPda);
    console.log("\nREAL Position (devnet):");
    console.log("   Shares:", userPosition.shares.toString());
    console.log("   Deposited USD:", userPosition.totalDepositedUsd.toString());
    console.log("   Timestamp:", new Date(userPosition.lastDepositTimestamp.toNumber() * 1000).toISOString());

    expect(tx).to.be.a("string");
    console.log("\nDeposit successful on REAL devnet!");
  } catch (error: any) {
    console.error("\nError:", error.message || error.toString());
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
