import { PublicKey, Connection } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const METEORA_DAMM_PROGRAM = new PublicKey("4eDLfPB8fwFxReyHE695Kjtdh2MJinrbekJ9aTLjYBqq");
const CONFIG_INDEX = 44;

const [configPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("config"), new BN(CONFIG_INDEX).toArrayLike(Buffer, "le", 8)],
  METEORA_DAMM_PROGRAM
);

console.log("Expected config PDA:", configPda.toString());

connection.getAccountInfo(configPda).then(info => {
  if (info) {
    console.log("Config exists!");
    console.log("Owner:", info.owner.toString());
    console.log("Expected owner:", METEORA_DAMM_PROGRAM.toString());
    console.log("Match:", info.owner.equals(METEORA_DAMM_PROGRAM));
  } else {
    console.log("Config does not exist yet");
  }
  process.exit(0);
});
