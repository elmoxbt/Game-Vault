const fs = require('fs');
const { Keypair } = require('@solana/web3.js');

// Generate new keypair
const keypair = Keypair.generate();

// Convert to array format for JSON
const secretKeyArray = Array.from(keypair.secretKey);

// Write to file
const keypairPath = 'meteora-cp-amm/target/deploy/cp_amm-keypair.json';
fs.writeFileSync(keypairPath, JSON.stringify(secretKeyArray));

console.log('✅ New Meteora program keypair generated!');
console.log('Program ID:', keypair.publicKey.toString());
console.log('Keypair saved to:', keypairPath);
