import axios from 'axios';
import { logger } from '../utils/logger.js';
import { getPrivateKey } from '../utils/config.js';
import ora from 'ora';
import { privateKeyToAccount } from 'viem/accounts';
import { x402Client } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm';
import { wrapAxiosWithPayment } from '@x402/axios';

interface TestOptions {
  key?: string;
  amount?: string;
  verbose?: boolean;
  network?: string;
}

// Map network names to chain IDs
const NETWORK_CHAIN_IDS: Record<string, number> = {
  'base': 8453,
  'base-mainnet': 8453,
  'base-sepolia': 84532,
  'ethereum': 1,
  'mainnet': 1,
  'sepolia': 11155111
};

export async function testEndpoint(url: string, options: TestOptions) {
  logger.header('Testing x402 Endpoint');
  logger.info(`Target: ${url}`);

  const spinner = ora();

  try {
    const privateKey = getPrivateKey(options.key);
    if (!privateKey) {
      logger.error('Private key required. Use --key flag or set X402_PRIVATE_KEY env var');
      process.exit(1);
    }

    // Validate private key format
    const formattedKey = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;

    spinner.start('Setting up x402 client');

    // Create EVM signer using viem
    const account = privateKeyToAccount(formattedKey);
    logger.info(`Using wallet: ${account.address}`);

    // Determine network
    const networkName = options.network || 'base-sepolia';
    const chainId = NETWORK_CHAIN_IDS[networkName.toLowerCase()];
    if (!chainId) {
      const available = Object.keys(NETWORK_CHAIN_IDS).join(', ');
      throw new Error(`Unknown network: ${networkName}. Available: ${available}`);
    }

    // Create and configure x402 client
    // Network format is "eip155:{chainId}" for EVM chains
    const network = `eip155:${chainId}` as const;
    const evmScheme = new ExactEvmScheme(account);

    const client = new x402Client()
      .register(network, evmScheme)
      .register('eip155:*', evmScheme); // Also register for wildcard matching

    // Wrap axios with payment handling
    const paymentAxios = wrapAxiosWithPayment(axios.create(), client);

    spinner.succeed('x402 client configured');
    logger.info(`Network: ${networkName} (chain ID: ${chainId})`);

    spinner.start('Making request to x402 endpoint');

    const response = await paymentAxios.get(url);

    spinner.succeed(`Request successful (status: ${response.status})`);

    logger.header('Response');

    if (options.verbose) {
      logger.json(response.data);
    } else {
      const dataStr = typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);

      if (dataStr.length > 500) {
        logger.log(dataStr.substring(0, 500) + '...');
        logger.info('Use --verbose to see full response');
      } else {
        logger.log(dataStr);
      }
    }

    // Check for payment details in response headers
    const paymentHeader = response.headers['x-payment-response'];
    if (paymentHeader) {
      logger.header('Payment Details');
      try {
        const paymentInfo = JSON.parse(paymentHeader);
        logger.keyValue('Transaction', paymentInfo.txHash || 'N/A');
        logger.keyValue('Network', paymentInfo.network || 'N/A');
      } catch {
        logger.keyValue('Payment Header', paymentHeader);
      }
    }

  } catch (error: any) {
    spinner.fail('Request failed');

    if (error.response?.status === 402) {
      logger.error('Payment failed or was rejected');
      logger.header('Payment Requirements');

      // Try to extract payment info from headers (v2) or body (v1)
      const paymentRequiredHeader = error.response.headers['x-payment-required'];
      if (paymentRequiredHeader) {
        try {
          const requirements = JSON.parse(paymentRequiredHeader);
          logger.json(requirements);
        } catch {
          logger.log(paymentRequiredHeader);
        }
      } else if (error.response.data) {
        logger.json(error.response.data);
      }
    } else {
      logger.error(error.message);
    }

    if (options.verbose && error.response) {
      logger.header('Full Error Response');
      logger.json({
        status: error.response.status,
        headers: error.response.headers,
        data: error.response.data
      });
    }

    process.exit(1);
  }
}
