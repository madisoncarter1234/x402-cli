import { logger } from '../utils/logger.js';
import { getPrivateKey, getNetwork, NETWORK_CHAIN_IDS } from '../utils/config.js';
import ora from 'ora';
import axios from 'axios';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, formatEther } from 'viem';
import { baseSepolia, sepolia } from 'viem/chains';

interface FundOptions {
  key?: string;
  network?: string;
  json?: boolean;
}

const FAUCETS: Record<string, { url: string; name: string; chain: any }> = {
  'base-sepolia': {
    url: 'https://www.coinbase.com/faucets/base-ethereum-goerli-faucet',
    name: 'Coinbase Base Sepolia Faucet',
    chain: baseSepolia
  },
  'sepolia': {
    url: 'https://sepoliafaucet.com/',
    name: 'Sepolia Faucet',
    chain: sepolia
  }
};

export async function fundCommand(options: FundOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('Fund Testnet Wallet');

  const spinner = ora();

  try {
    const privateKey = getPrivateKey(options.key);
    if (!privateKey) {
      logger.error('Private key required. Use --key flag or set X402_PRIVATE_KEY env var');
      if (options.json) logger.outputJson();
      process.exit(1);
    }

    const formattedKey = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
    const account = privateKeyToAccount(formattedKey);
    const networkName = getNetwork(options.network);

    logger.info(`Wallet: ${account.address}`);
    logger.info(`Network: ${networkName}`);
    logger.setJsonData('wallet', account.address);
    logger.setJsonData('network', networkName);

    const faucet = FAUCETS[networkName.toLowerCase()];

    if (!faucet) {
      logger.error(`No faucet available for ${networkName}. Faucets only available for testnets.`);
      logger.info('Available testnet faucets: base-sepolia, sepolia');
      if (options.json) logger.outputJson();
      process.exit(1);
    }

    // Check current balance
    spinner.start('Checking current balance');

    const client = createPublicClient({
      chain: faucet.chain,
      transport: http()
    });

    const balance = await client.getBalance({ address: account.address });
    const balanceEth = formatEther(balance);

    spinner.succeed(`Current balance: ${balanceEth} ETH`);
    logger.setJsonData('currentBalance', balanceEth);

    // Provide faucet instructions
    logger.header('Faucet Instructions');
    logger.log(`\n1. Visit: ${faucet.url}`);
    logger.log(`2. Connect your wallet or paste address: ${account.address}`);
    logger.log(`3. Complete verification and request funds\n`);

    logger.setJsonData('faucet', {
      name: faucet.name,
      url: faucet.url,
      address: account.address
    });

    // Try automated faucet if available (Base Sepolia via Coinbase)
    if (networkName.toLowerCase() === 'base-sepolia') {
      logger.info('Tip: Use Coinbase Wallet for instant Base Sepolia ETH');
      logger.info('Or use: https://portal.cdp.coinbase.com/products/faucet');
    }

    // Copy address to clipboard hint
    logger.log(`\nYour address (copy this): ${account.address}`);

    if (options.json) logger.outputJson();

  } catch (error: any) {
    spinner.fail('Failed to process fund request');
    logger.error(error.message);
    logger.setJsonData('error', error.message);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
