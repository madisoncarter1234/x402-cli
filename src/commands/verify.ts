import { logger } from '../utils/logger.js';
import { getRpcUrl } from '../utils/config.js';
import ora from 'ora';
import { createPublicClient, http, formatUnits, type Chain } from 'viem';
import { base, baseSepolia, mainnet, sepolia } from 'viem/chains';

interface VerifyOptions {
  network?: string;
  json?: boolean;
}

// Common USDC contract addresses
const USDC_ADDRESSES: Record<string, `0x${string}`> = {
  'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-mainnet': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'ethereum': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  'mainnet': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  'sepolia': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
};

function getChain(networkName: string): Chain {
  const chains: Record<string, Chain> = {
    'base': base,
    'base-mainnet': base,
    'base-sepolia': baseSepolia,
    'ethereum': mainnet,
    'mainnet': mainnet,
    'sepolia': sepolia
  };

  const chain = chains[networkName.toLowerCase()];
  if (!chain) {
    throw new Error(`Unknown network: ${networkName}. Available: ${Object.keys(chains).join(', ')}`);
  }
  return chain;
}

export async function verifyTransaction(txHash: string, options: VerifyOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('Verify x402 Transaction');
  const networkName = options.network || 'base-sepolia';
  logger.info(`Transaction: ${txHash}`);
  logger.info(`Network: ${networkName}`);

  logger.setJsonData('txHash', txHash);
  logger.setJsonData('network', networkName);

  const spinner = ora('Connecting to network').start();

  try {
    // Validate tx hash format
    const formattedHash = (txHash.startsWith('0x') ? txHash : `0x${txHash}`) as `0x${string}`;
    if (!/^0x[a-fA-F0-9]{64}$/.test(formattedHash)) {
      spinner.fail('Invalid transaction hash format');
      logger.error('Transaction hash must be 64 hex characters');
      process.exit(1);
    }

    const chain = getChain(networkName);
    const rpcUrl = getRpcUrl(networkName);

    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl)
    });

    spinner.text = 'Fetching transaction';

    const tx = await publicClient.getTransaction({
      hash: formattedHash
    });

    if (!tx) {
      spinner.fail('Transaction not found');
      logger.error('This transaction does not exist on the specified network');
      process.exit(1);
    }

    spinner.text = 'Fetching transaction receipt';

    const receipt = await publicClient.getTransactionReceipt({
      hash: formattedHash
    });

    spinner.succeed('Transaction found');

    logger.header('Transaction Details');
    logger.keyValue('Status', receipt.status === 'success' ? 'Success' : 'Failed');
    logger.keyValue('Block', receipt.blockNumber.toString());
    logger.keyValue('From', tx.from);
    logger.keyValue('To', tx.to || 'Contract Creation');
    logger.keyValue('Gas Used', receipt.gasUsed.toString());

    logger.setJsonData('transaction', {
      status: receipt.status,
      block: receipt.blockNumber.toString(),
      from: tx.from,
      to: tx.to || null,
      gasUsed: receipt.gasUsed.toString()
    });

    // Check for USDC transfers (common x402 payment token)
    const usdcAddress = USDC_ADDRESSES[networkName.toLowerCase()];

    logger.header('Payment Analysis');

    // Look for Transfer events in the logs
    // Transfer event topic: keccak256("Transfer(address,address,uint256)")
    const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

    const transferLogs = receipt.logs.filter(log => {
      return log.topics[0] === TRANSFER_TOPIC;
    });

    if (transferLogs.length === 0) {
      logger.warn('No ERC20 transfers found in this transaction');
      logger.info('This may not be an x402 payment transaction');
      logger.setJsonData('transfers', []);
      if (options.json) logger.outputJson();
      return;
    }

    logger.log(`\nFound ${transferLogs.length} token transfer(s):\n`);

    for (const log of transferLogs) {
      const isUsdc = log.address.toLowerCase() === usdcAddress?.toLowerCase();
      const from = `0x${log.topics[1]?.slice(26)}`;
      const to = `0x${log.topics[2]?.slice(26)}`;
      const value = BigInt(log.data);

      // USDC has 6 decimals
      const decimals = isUsdc ? 6 : 18;
      const formattedValue = formatUnits(value, decimals);

      logger.keyValue('Token', isUsdc ? 'USDC' : log.address);
      logger.keyValue('From', from);
      logger.keyValue('To', to);
      logger.keyValue('Amount', `${formattedValue}${isUsdc ? ' USDC' : ''}`);

      if (isUsdc) {
        logger.success('This appears to be a USDC payment (common x402 token)');
      }

      logger.appendJsonData('transfers', {
        token: isUsdc ? 'USDC' : log.address,
        from,
        to,
        amount: formattedValue,
        isUsdc
      });

      console.log();
    }

    // Check for x402-specific patterns
    if (tx.input && tx.input.length > 10) {
      // Check for common x402 method signatures
      const methodSig = tx.input.slice(0, 10);

      // transferWithAuthorization (EIP-3009) used by x402
      if (methodSig === '0xe3ee160e') {
        logger.success('EIP-3009 transferWithAuthorization detected');
        logger.info('This is the standard x402 payment method');
      }

      // receiveWithAuthorization
      if (methodSig === '0xef55bec6') {
        logger.success('EIP-3009 receiveWithAuthorization detected');
      }
    }

    if (options.json) logger.outputJson();

  } catch (error: any) {
    spinner.fail('Verification failed');

    if (error.message?.includes('not found')) {
      logger.error('Transaction not found on this network');
      logger.warn('Try a different network with --network flag');
    } else {
      logger.error(error.message);
    }

    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
