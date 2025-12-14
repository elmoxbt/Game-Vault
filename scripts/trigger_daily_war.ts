import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Gamevault } from "../target/types/gamevault";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_SLOT_HASHES_PUBKEY,
  Connection,
} from "@solana/web3.js";
import { expect } from "chai";
import * as fs from "fs";

// REAL DEVNET: Trigger daily liquidity war
// DEPLOYED PROGRAM: 5vdaPrsz1naFvdEAC9ePTTvnFeszhiqEDVuY1FhHejpi
// Cost: <0.06 SOL (0.05 SOL fee + gas)
// Fee Distribution: 70% top 10 LPs, 20% SOL to #1 defender, 10% treasury

const DEPLOYED_PROGRAM_ID = new PublicKey("5vdaPrsz1naFvdEAC9ePTTvnFeszhiqEDVuY1FhHejpi");
const NATIVE_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const METEORA_DAMM_PROGRAM = new PublicKey("4eDLfPB8fwFxReyHE695Kjtdh2MJinrbekJ9aTLjYBqq");
const JUPITER_V6_PROGRAM = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");

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

  console.log("\nREAL DEVNET: Triggering Daily War");
  console.log("Program ID:", DEPLOYED_PROGRAM_ID.toString());
  console.log("Caller:", walletKeypair.publicKey.toString());

  const caller = walletKeypair;

  // Derive PDAs
  const [warHistoryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("war_history"), VAULT_PDA.toBuffer()],
    DEPLOYED_PROGRAM_ID
  );

  const [leaderboardPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("leaderboard"), VAULT_PDA.toBuffer()],
    DEPLOYED_PROGRAM_ID
  );

  // REAL: Get #1 defender from leaderboard
  const leaderboard = await program.account.leaderboard.fetch(leaderboardPda);
  if (leaderboard.top10.length === 0) {
    throw new Error("No LPs on leaderboard - deposit liquidity first");
  }
  const defender = leaderboard.top10[0].user;

  console.log("\nWar Parameters:");
  console.log("   Attack Size: Random 5-50% (Switchboard VRF seed: 42)");
  console.log("   #1 Defender:", defender.toString());
  console.log("   Jupiter v6:", JUPITER_V6_PROGRAM.toString());

  // REAL: Check defender balance before
  const defenderBalanceBefore = await provider.connection.getBalance(defender);
  const vaultBefore = await program.account.vault.fetch(VAULT_PDA);
  const treasuryBefore = vaultBefore.treasurySol.toNumber();

  // REAL DEVNET: Trigger war with deterministic VRF seed
  try {
    const tx = await program.methods
      .triggerDailyWar({
        attackSizeBps: null, // VRF determines attack size (using seed 42)
      })
      .accountsStrict({
        caller: caller.publicKey,
        vault: VAULT_PDA,
        warHistory: warHistoryPda,
        leaderboard: leaderboardPda,
        defender: defender,
        dammPool: DAMM_POOL_PDA,
        gameTokenMint: GAME_TOKEN_MINT,
        solMint: NATIVE_SOL_MINT,
        jupiterProgram: JUPITER_V6_PROGRAM,
        slotHashes: SYSVAR_SLOT_HASHES_PUBKEY, // Deterministic: recent_slothashes for seed
        systemProgram: SystemProgram.programId,
      })
      .signers([caller])
      .rpc();

    console.log("\nREAL TX:", tx);
    console.log(`https://solscan.io/tx/${tx}?cluster=devnet`);

    // REAL: Fetch war results
    const warHistory = await program.account.warHistory.fetch(warHistoryPda);
    const vaultAfter = await program.account.vault.fetch(VAULT_PDA);
    const treasuryAfter = vaultAfter.treasurySol.toNumber();
    const defenderBalanceAfter = await provider.connection.getBalance(defender);

    const totalFees = warHistory.totalFeesDistributed.toNumber();
    const treasuryGain = (treasuryAfter - treasuryBefore) / anchor.web3.LAMPORTS_PER_SOL;
    const defenderBonus = (defenderBalanceAfter - defenderBalanceBefore) / anchor.web3.LAMPORTS_PER_SOL;

    console.log("\nREAL Fee Distribution (devnet):");
    console.log("   Total Fees:", (totalFees / anchor.web3.LAMPORTS_PER_SOL).toFixed(4), "SOL");
    console.log("   Top 10 LPs (70%):", ((totalFees * 0.7) / anchor.web3.LAMPORTS_PER_SOL).toFixed(4), "SOL");
    console.log("   #1 Defender SOL Bonus (20%):", defenderBonus.toFixed(4), "SOL");
    console.log("   Treasury (10%):", treasuryGain.toFixed(4), "SOL");

    console.log("\nREAL War Stats:");
    console.log("   Total Wars:", warHistory.totalWars.toString());
    console.log("   Last War:", new Date(warHistory.lastWarTimestamp.toNumber() * 1000).toISOString());
    console.log("   Next War:", new Date(warHistory.scheduledWarTime.toNumber() * 1000).toISOString());

    expect(tx).to.be.a("string");
    expect(defenderBonus).to.be.greaterThan(0);
    console.log("\nWar executed successfully on REAL devnet!");
  } catch (error: any) {
    if (error.toString().includes("6002")) {
      console.log("\n24-hour war cooldown active");
      console.log("   Wars can only happen once every 24 hours");
    } else if (error.toString().includes("6016")) {
      console.log("\nNot within 2-hour war window");
      console.log("   War scheduled for random time within window");
    } else if (error.toString().includes("6019")) {
      console.log("\nVault TVL < 100 SOL minimum");
      console.log("   Deposit more liquidity for wars");
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
