import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Connection,
} from "@solana/web3.js";
import * as fs from "fs";

// REAL DEVNET: Initialize Meteora CP-AMM Config
// Meteora Program: 4eDLfPB8fwFxReyHE695Kjtdh2MJinrbekJ9aTLjYBqq
// Cost: ~0.002 SOL (config account rent)

const METEORA_DAMM_PROGRAM = new PublicKey("4eDLfPB8fwFxReyHE695Kjtdh2MJinrbekJ9aTLjYBqq");
const CONFIG_INDEX = 44; // Deterministic seed for testing

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

  // Load Meteora program
  const meteoraProgram = new Program(
    require("../meteora-cp-amm/target/idl/cp_amm.json"),
    provider
  );

  console.log("\n🔵 REAL DEVNET: Initialize Meteora Config");
  console.log("=".repeat(70));
  console.log("Meteora Program:", METEORA_DAMM_PROGRAM.toString());
  console.log("Admin:", walletKeypair.publicKey.toString());
  console.log("Config Index:", CONFIG_INDEX);

  // Derive config PDA
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), new BN(CONFIG_INDEX).toArrayLike(Buffer, "le", 8)],
    METEORA_DAMM_PROGRAM
  );

  console.log("Config PDA:", configPda.toString());

  // Derive event authority PDA
  const [eventAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    METEORA_DAMM_PROGRAM
  );

  // Config parameters
  const configParameters = {
    poolFees: {
      baseFee: {
        cliffFeeNumerator: new BN(2500000),
        firstFactor: 0,
        secondFactor: [0, 0, 0, 0, 0, 0, 0, 0],
        thirdFactor: new BN(0),
        baseFeeMode: 0,
      },
      padding: [0, 0, 0],
      dynamicFee: null,
    },
    sqrtMinPrice: new BN("79228162514264337593543"),      // ~0.000001
    sqrtMaxPrice: new BN("79228162514264337593543950"),   // ~1000000
    vaultConfigKey: PublicKey.default,                    // No alpha vault
    poolCreatorAuthority: walletKeypair.publicKey,        // Allow your wallet to create pools
    activationType: 0,                                     // Slot-based activation
    collectFeeMode: 0,                                     // Standard fee collection
  };

  console.log("\n📊 Config Parameters:");
  console.log("   Pool Creator Authority:", configParameters.poolCreatorAuthority.toString());
  console.log("   Activation Type: Slot-based");
  console.log("   Fee Mode: Standard");
  console.log("   Min Price: ~0.000001");
  console.log("   Max Price: ~1000000");

  try {
    // Check if config already exists
    try {
      const configAccountInfo = await provider.connection.getAccountInfo(configPda);
      if (configAccountInfo !== null) {
        console.log("\n⚠️  Config already exists!");
        console.log("Config PDA:", configPda.toString());
        console.log("Use this config in your init_vault.ts script");
        return;
      }
    } catch (e) {
      // Config doesn't exist, continue with creation
    }

    console.log("\n🔄 Creating config...");

    // Create config
    const tx = await meteoraProgram.methods
      .createConfig(new BN(CONFIG_INDEX), configParameters)
      .accountsStrict({
        config: configPda,
        admin: walletKeypair.publicKey,
        systemProgram: SystemProgram.programId,
        eventAuthority: eventAuthority,
        program: METEORA_DAMM_PROGRAM,
      })
      .signers([walletKeypair])
      .rpc();

    console.log("\n✅ REAL TX:", tx);
    console.log(`https://solscan.io/tx/${tx}?cluster=devnet`);

    // Fetch and display config
    console.log("\n📋 Config created successfully!");
    console.log("   Config PDA:", configPda.toString());
    console.log("   Index:", CONFIG_INDEX);
    console.log("\n🎉 SUCCESS! Use this config PDA in init_vault.ts:");
    console.log("   Config:", configPda.toString());

  } catch (error: any) {
    console.error("\n❌ Error:", error.message || error.toString());
    if (error.logs) {
      console.error("\nProgram Logs:");
      error.logs.forEach((log: string) => console.error("  ", log));
    }
    throw error;
  }

  console.log("=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
