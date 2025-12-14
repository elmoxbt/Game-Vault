const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const configPubkey = new PublicKey('HuRfytxdwDkWeohmjUPFsMfhgX8gedC1rpLyTSK5omTv');

(async () => {
  const accountInfo = await connection.getAccountInfo(configPubkey);
  if (!accountInfo) {
    console.log('Config account not found');
    return;
  }

  const data = accountInfo.data;

  // Read index at offset 200
  const index = data.readBigUInt64LE(200);
  console.log('Config index:', index.toString());

  // Read sqrt_min_price at offset 208 (16 bytes, little-endian u128)
  const sqrtMinPriceLow = data.readBigUInt64LE(208);
  const sqrtMinPriceHigh = data.readBigUInt64LE(216);
  const sqrtMinPrice = (sqrtMinPriceHigh << BigInt(64)) | sqrtMinPriceLow;

  // Read sqrt_max_price at offset 224 (16 bytes, little-endian u128)
  const sqrtMaxPriceLow = data.readBigUInt64LE(224);
  const sqrtMaxPriceHigh = data.readBigUInt64LE(232);
  const sqrtMaxPrice = (sqrtMaxPriceHigh << BigInt(64)) | sqrtMaxPriceLow;

  console.log('sqrt_min_price:', sqrtMinPrice.toString());
  console.log('sqrt_max_price:', sqrtMaxPrice.toString());
  console.log('');

  // Our price
  const ourPrice = 0.001;
  const Q64 = BigInt(2) ** BigInt(64);
  const ourSqrtPrice = BigInt(Math.floor(Math.sqrt(ourPrice) * Number(Q64)));

  console.log('Our sqrt_price for price', ourPrice, ':', ourSqrtPrice.toString());
  console.log('');

  if (ourSqrtPrice >= sqrtMinPrice && ourSqrtPrice <= sqrtMaxPrice) {
    console.log('✅ IN RANGE');
  } else {
    console.log('❌ OUT OF RANGE');
    console.log('Valid range:', sqrtMinPrice.toString(), 'to', sqrtMaxPrice.toString());

    // Suggest a valid price
    const Q64_num = Number(Q64);
    const minSqrtNorm = Number(sqrtMinPrice) / Q64_num;
    const maxSqrtNorm = Number(sqrtMaxPrice) / Q64_num;
    const minPrice = minSqrtNorm * minSqrtNorm;
    const maxPrice = maxSqrtNorm * maxSqrtNorm;

    console.log('\nValid price range:', minPrice.toExponential(3), 'to', maxPrice.toExponential(3));

    // Try a price of 1.0
    const testPrice = 1.0;
    const testSqrtPrice = BigInt(Math.floor(Math.sqrt(testPrice) * Q64_num));
    console.log('\nTest price', testPrice, '-> sqrt_price:', testSqrtPrice.toString());
    if (testSqrtPrice >= sqrtMinPrice && testSqrtPrice <= sqrtMaxPrice) {
      console.log('✅ Price 1.0 IS in range');
    } else {
      console.log('❌ Price 1.0 is STILL out of range');
    }
  }
})();
