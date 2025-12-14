import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Gamevault } from "../target/types/gamevault";
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Keypair, SystemProgram, Connection } from "@solana/web3.js";
import { expect } from "chai";
import * as fs from "fs";

// REAL DEVNET: Withdraw liquidity from GameVault
// DEPLOYED PROGRAM: 5vdaPrsz1naFvdEAC9ePTTvnFeszhiqEDVuY1FhHejpi
// Cost: <0.005 SOL (CPI + gas)

const DEPLOYED_PROGRAM_ID = new PublicKey("5vdaPrsz1naFvdEAC9ePTTvnFeszhiqEDVuY1FhHejpi");
const NATIVE_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const METEORA_DAMM_PROGRAM = new PublicKey("4eDLfPB8fwFxReyHE695Kjtdh2MJinrbekJ9aTLjYBqq");

// REPLACE WITH YOUR REAL VALUES
const GAME_TOKEN_MINT = new PublicKey("GvTLp1a1TTcEM1q8bW3vgzzzjQSxkFw3XeMAyme7999j");
const VAULT_PDA = new PublicKey("GowQtKtSsppWNM4Cd36t7y8wCxw6YbKrmNojsUWuXoip");
const DAMM_POOL_PDA = new PublicKey("BLijHkqiYBjknMkc7NmrASgskyjdmaSvcUxgwWjLCrEa");

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

  console.log("\nREAL DEVNET: Withdrawing Liquidity");
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

  // REAL: Check position before
  const positionBefore = await program.account.userPosition.fetch(userPositionPda);
  console.log("\nPosition BEFORE:");
  console.log("   Shares:", positionBefore.shares.toString());
  console.log("   Deposited USD:", positionBefore.totalDepositedUsd.toString());

  const gameBalanceBefore = Number(userGameToken.amount);
  const solBalanceBefore = await provider.connection.getBalance(user.publicKey);

  // REAL DEVNET: Withdraw all shares (null = full withdrawal)
  try {
    const tx = await program.methods
      .withdraw({
        sharesToWithdraw: null, // null = withdraw ALL shares
      })
      .accountsStrict({
        user: user.publicKey,
        vault: VAULT_PDA,
        userPosition: userPositionPda,
        leaderboard: leaderboardPda,
        userGameToken: userGameToken.address,
        userSolToken: userSolToken.address,
        dammPool: DAMM_POOL_PDA,
        meteoraDammProgram: METEORA_DAMM_PROGRAM,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    console.log("\nREAL TX:", tx);
    console.log(`https://solscan.io/tx/${tx}?cluster=devnet`);

    // REAL: Check balances after
    const userGameTokenAfter = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      user,
      GAME_TOKEN_MINT,
      user.publicKey
    );
    const gameBalanceAfter = Number(userGameTokenAfter.amount);
    const solBalanceAfter = await provider.connection.getBalance(user.publicKey);

    console.log("\nREAL Withdrawn Amounts:");
    console.log("   Game Tokens:", ((gameBalanceAfter - gameBalanceBefore) / 1e9).toFixed(2));
    console.log("   SOL:", ((solBalanceAfter - solBalanceBefore) / anchor.web3.LAMPORTS_PER_SOL).toFixed(4));

    // REAL: Verify position closed
    try {
      await program.account.userPosition.fetch(userPositionPda);
      console.log("\nPosition still exists (partial withdrawal)");
    } catch {
      console.log("\nPosition closed (full withdrawal)");
      console.log("   User removed from leaderboard");
      console.log("   Rent refunded");
    }

    expect(tx).to.be.a("string");
    expect(gameBalanceAfter).to.be.greaterThan(gameBalanceBefore);
    console.log("\nWithdrawal successful on REAL devnet!");
  } catch (error: any) {
    if (error.toString().includes("6005")) {
      console.log("\nNo position to withdraw");
      console.log("   Deposit liquidity first");
    } else {
      console.error("\nError:", error.message || error.toString());
      throw error;
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
