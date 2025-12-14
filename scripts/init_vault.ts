import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Gamevault } from "../target/types/gamevault";
import {
  createMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  createSyncNativeInstruction,
} from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Connection,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import * as fs from "fs";

// REAL DEVNET: Initialize GameVault with Meteora DAMM v2 pool
// DEPLOYED PROGRAM: 5vdaPrsz1naFvdEAC9ePTTvnFeszhiqEDVuY1FhHejpi
// Cost: <0.1 SOL (pool creation + rent)

const DEPLOYED_PROGRAM_ID = new PublicKey("9h99ZKZpprYZn2xaBEQC2R62BJCCYFMg7XEjTDzqAxk5");
const NATIVE_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const METEORA_DAMM_PROGRAM = new PublicKey("4eDLfPB8fwFxReyHE695Kjtdh2MJinrbekJ9aTLjYBqq");
const METEORA_CONFIG_PDA = new PublicKey("HuRfytxdwDkWeohmjUPFsMfhgX8gedC1rpLyTSK5omTv");
const PYTH_SOL_USD_DEVNET = new PublicKey("H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG");

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

  console.log("\nREAL DEVNET: Initializing GameVault");
  console.log("Program ID:", DEPLOYED_PROGRAM_ID.toString());
  console.log("Payer:", walletKeypair.publicKey.toString());

  // REAL DEVNET: Create game token mint
  const maker = walletKeypair;
  const gameTokenMint = await createMint(
    provider.connection,
    maker,
    maker.publicKey,
    null,
    9
  );
  console.log("REAL Game Token Mint:", gameTokenMint.toString());

  // Derive vault PDA
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), gameTokenMint.toBuffer(), NATIVE_SOL_MINT.toBuffer()],
    DEPLOYED_PROGRAM_ID
  );

  // Use the already-created config PDA
  const config = METEORA_CONFIG_PDA;
  // Derive REAL Meteora pool PDA
  const maxKey = gameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0
    ? gameTokenMint
    : NATIVE_SOL_MINT;
  const minKey = gameTokenMint.toBuffer().compare(NATIVE_SOL_MINT.toBuffer()) > 0
    ? NATIVE_SOL_MINT
    : gameTokenMint;

  const [dammPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), config.toBuffer(), maxKey.toBuffer(), minKey.toBuffer()],
    METEORA_DAMM_PROGRAM
  );

  // REAL: Position NFT mint (must be signer)
  const positionNftMint = Keypair.generate();

  const [positionNftAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("position_nft_account"), positionNftMint.publicKey.toBuffer()],
    METEORA_DAMM_PROGRAM
  );

  const [position] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), positionNftMint.publicKey.toBuffer()],
    METEORA_DAMM_PROGRAM
  );

  const [tokenAVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_vault"), gameTokenMint.toBuffer(), dammPoolPda.toBuffer()],
    METEORA_DAMM_PROGRAM
  );

  const [tokenBVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_vault"), NATIVE_SOL_MINT.toBuffer(), dammPoolPda.toBuffer()],
    METEORA_DAMM_PROGRAM
  );

  // REAL: Create payer token accounts
  const payerGameTokenAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    maker,
    gameTokenMint,
    maker.publicKey
  );

  const payerSolTokenAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    maker,
    NATIVE_SOL_MINT,
    maker.publicKey
  );

  // Mint tokens to the payer accounts for initial liquidity
  const gameTokenAmount = new BN(1_000_000).mul(new BN(1e9)); // 1 million tokens with 9 decimals
  const solAmountLamports = 1 * 1e9; // 1 SOL in lamports

  console.log("\nPreparing initial liquidity:");
  console.log("   Game tokens:", gameTokenAmount.toString());
  console.log("   SOL:", solAmountLamports / 1e9, "SOL");

  // Mint game tokens
  await mintTo(
    provider.connection,
    maker,
    gameTokenMint,
    payerGameTokenAccount.address,
    maker,
    gameTokenAmount.toNumber()
  );
  console.log("   Game tokens minted");

  // Wrap SOL: Transfer SOL to the wrapped SOL account and sync
  const wrapTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: maker.publicKey,
      toPubkey: payerSolTokenAccount.address,
      lamports: solAmountLamports,
    }),
    createSyncNativeInstruction(payerSolTokenAccount.address)
  );

  await sendAndConfirmTransaction(provider.connection, wrapTx, [maker]);
  console.log("   SOL wrapped");

  const [poolAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_authority")],
    METEORA_DAMM_PROGRAM
  );

  const [eventAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    METEORA_DAMM_PROGRAM
  );

  console.log("\nVault Parameters:");
  console.log("   Vault PDA:", vaultPda.toString());
  console.log("   Liquidity: 1,000,000 pool shares");
  console.log("   Initial Price: 100,000,000 (1e8)");
  console.log("   Game Token Mint:", gameTokenMint.toString());
  console.log("   DAMM Pool:", dammPoolPda.toString());
  console.log("   Pyth Feed:", PYTH_SOL_USD_DEVNET.toString());

  // REAL DEVNET: Execute init_vault
  try {
    const tx = await program.methods
      .initVault({
        liquidity: new BN(1_000_000 * 1e9),
        initialPrice: 1e8,  // 100 million - within config's valid range
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ])
      .accountsStrict({
        maker: maker.publicKey,
        vault: vaultPda,
        gameTokenMint: gameTokenMint,
        solMint: NATIVE_SOL_MINT,
        config: config,
        poolAuthority: poolAuthority,
        dammPool: dammPoolPda,
        positionNftMint: positionNftMint.publicKey,
        positionNftAccount: positionNftAccount,
        position: position,
        tokenAVault: tokenAVault,
        tokenBVault: tokenBVault,
        payerTokenA: payerGameTokenAccount.address,
        payerTokenB: payerSolTokenAccount.address,
        pythPriceFeed: PYTH_SOL_USD_DEVNET,
        tokenAProgram: TOKEN_PROGRAM_ID,
        tokenBProgram: TOKEN_PROGRAM_ID,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        meteoraDammProgram: METEORA_DAMM_PROGRAM,
        eventAuthority: eventAuthority,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([maker, positionNftMint])
      .rpc();

    console.log("\nREAL TX:", tx);
    console.log(`https://solscan.io/tx/${tx}?cluster=devnet`);

    // REAL: Fetch vault state
    const vault = await program.account.vault.fetch(vaultPda);
    console.log("\nREAL Vault State (devnet):");
    console.log("   Vault PDA:", vaultPda.toString());
    console.log("   Authority:", vault.authority.toString());
    console.log("   Game Token Mint:", vault.gameTokenMint.toString());
    console.log("   DAMM Pool:", vault.dammPool.toString());
    console.log("   Total Shares:", vault.totalShares.toString());
    console.log("   Pyth Price:", vault.lastPythPrice.toString());
    console.log("   Treasury SOL:", vault.treasurySol.toString());

    console.log("\nImportant Addresses for Tests:");
    console.log("   VAULT_PDA=", vaultPda.toString());
    console.log("   GAME_TOKEN_MINT=", gameTokenMint.toString());
    console.log("   DAMM_POOL=", vault.dammPool.toString());

    console.log("\nVault initialized on REAL devnet!");
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
