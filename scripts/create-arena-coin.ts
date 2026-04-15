/**
 * scripts/create-arena-coin.ts
 *
 * Run ONCE to create the Arena Coin Fungible Token on Hedera Testnet.
 * After running, copy the printed Token ID into your .env as ARENA_COIN_TOKEN_ID.
 *
 * Usage:
 *   npx ts-node scripts/create-arena-coin.ts
 */

import 'dotenv/config';
import {
  Client,
  PrivateKey,
  AccountId,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
} from '@hashgraph/sdk';

async function main() {
  const accountIdStr = process.env.HEDERA_ACCOUNT_ID!;
  const privateKeyStr = process.env.HEDERA_PRIVATE_KEY!;

  if (!accountIdStr || !privateKeyStr) {
    throw new Error('HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY must be set in .env');
  }

  const operatorId = AccountId.fromString(accountIdStr);
  const operatorKey = PrivateKey.fromStringECDSA(privateKeyStr);

  const client = Client.forTestnet();
  client.setOperator(operatorId, operatorKey);

  console.log(`\n🏗️  Creating Arena Coin on Hedera Testnet...`);
  console.log(`   Treasury: ${accountIdStr}`);

  const tx = await new TokenCreateTransaction()
    .setTokenName('Arena Coin')
    .setTokenSymbol('ARENA')
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(2)                        // 1 ARENA = 100 units (like cents)
    .setInitialSupply(100_000_00)          // 100,000 ARENA tokens initially (infinite mintable by admin)
    .setTreasuryAccountId(operatorId)
    .setAdminKey(operatorKey.publicKey)    // Can update the token
    .setSupplyKey(operatorKey.publicKey)   // Can mint more tokens anytime
    .setFreezeDefault(false)
    .freezeWith(client)
    .sign(operatorKey);

  const submit = await tx.execute(client);
  const receipt = await submit.getReceipt(client);

  const tokenId = receipt.tokenId!.toString();

  client.close();

  console.log(`\n✅ Arena Coin created successfully!`);
  console.log(`   Token ID: ${tokenId}`);
  console.log(`   Initial Supply: 100,000 ARENA`);
  console.log(`   Decimals: 2`);
  console.log(`\n👉 Add this to your .env file:`);
  console.log(`   ARENA_COIN_TOKEN_ID=${tokenId}`);
  console.log(`\n🔍 View on HashScan: https://hashscan.io/testnet/token/${tokenId}`);
}

main().catch((err) => {
  console.error('❌ Failed to create token:', err);
  process.exit(1);
});
