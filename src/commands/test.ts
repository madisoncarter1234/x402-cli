import axios from 'axios';
import { logger } from '../utils/logger.js';
import { getPrivateKey, getNetwork, NETWORK_CHAIN_IDS } from '../utils/config.js';
import { saveReceipt, type PaymentReceipt } from './receipt.js';
import ora from 'ora';
import { privateKeyToAccount } from 'viem/accounts';
import { x402Client } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm';
import { wrapAxiosWithPayment } from '@x402/axios';
import { randomUUID } from 'crypto';

interface TestOptions {
  key?: string;
  amount?: string;
  verbose?: boolean;
  network?: string;
  dryRun?: boolean;
  json?: boolean;
}

export async function testEndpoint(url: string, options: TestOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('Testing x402 Endpoint');
  logger.info(`Target: ${url}`);

  const spinner = ora();

  try {
    const privateKey = getPrivateKey(options.key);
    if (!privateKey) {
      logger.error('Private key required. Use --key flag or set X402_PRIVATE_KEY env var');
      if (options.json) logger.outputJson();
      process.exit(1);
    }

    const formattedKey = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;

    spinner.start('Setting up x402 client');

    const account = privateKeyToAccount(formattedKey);
    logger.info(`Using wallet: ${account.address}`);
    logger.setJsonData('wallet', account.address);

    const networkName = getNetwork(options.network);
    const chainId = NETWORK_CHAIN_IDS[networkName.toLowerCase()];
    if (!chainId) {
      const available = Object.keys(NETWORK_CHAIN_IDS).join(', ');
      throw new Error(`Unknown network: ${networkName}. Available: ${available}`);
    }

    logger.setJsonData('network', networkName);
    logger.setJsonData('chainId', chainId);

    // If dry-run, just fetch the payment requirements
    if (options.dryRun) {
      spinner.succeed('Dry run mode');
      spinner.start('Fetching payment requirements');

      const response = await axios.get(url, {
        validateStatus: (status) => status === 402 || status === 200
      });

      if (response.status === 200) {
        spinner.succeed('Endpoint is publicly accessible (no payment required)');
        logger.setJsonData('paymentRequired', false);
        if (options.json) logger.outputJson();
        return;
      }

      spinner.succeed('Payment requirements retrieved');

      // Parse requirements
      const paymentHeader = response.headers['x-payment-required'];
      let paymentData: any;

      if (paymentHeader) {
        try {
          paymentData = JSON.parse(paymentHeader);
        } catch {
          paymentData = response.data;
        }
      } else {
        paymentData = response.data;
      }

      const accepts = paymentData.accepts || paymentData.paymentRequirements || [];

      logger.header('Would Pay');
      logger.setJsonData('paymentRequired', true);

      if (accepts[0]) {
        const req = accepts[0];
        const amount = req.maxAmountRequired || req.amount;
        const asset = req.asset || 'unknown';
        const payTo = req.payTo || req.recipient;

        logger.keyValue('Amount', amount);
        logger.keyValue('Asset', asset);
        logger.keyValue('To', payTo);
        logger.keyValue('Network', req.network || networkName);

        logger.setJsonData('payment', {
          amount,
          asset,
          to: payTo,
          network: req.network || networkName
        });
      }

      logger.log('\nRun without --dry-run to execute payment');
      if (options.json) logger.outputJson();
      return;
    }

    // Full payment flow
    const network = `eip155:${chainId}` as const;
    const evmScheme = new ExactEvmScheme(account);

    const client = new x402Client()
      .register(network, evmScheme)
      .register('eip155:*', evmScheme);

    const paymentAxios = wrapAxiosWithPayment(axios.create(), client);

    spinner.succeed('x402 client configured');
    logger.info(`Network: ${networkName} (chain ID: ${chainId})`);

    spinner.start('Making request to x402 endpoint');

    const response = await paymentAxios.get(url);

    spinner.succeed(`Request successful (status: ${response.status})`);

    logger.header('Response');
    logger.setJsonData('status', response.status);

    if (options.verbose || options.json) {
      logger.json(response.data);
      logger.setJsonData('response', response.data);
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

    // Check for payment details and save receipt
    const paymentHeader = response.headers['x-payment-response'];
    if (paymentHeader) {
      logger.header('Payment Details');
      try {
        const paymentInfo = JSON.parse(paymentHeader);
        logger.keyValue('Transaction', paymentInfo.txHash || 'N/A');
        logger.keyValue('Network', paymentInfo.network || networkName);

        // Save receipt
        const receipt: PaymentReceipt = {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          url,
          txHash: paymentInfo.txHash,
          network: paymentInfo.network || networkName,
          amount: paymentInfo.amount || 'unknown',
          asset: paymentInfo.asset || 'USDC',
          from: account.address,
          to: paymentInfo.recipient || 'unknown',
          status: 'success'
        };

        saveReceipt(receipt);
        logger.success(`Receipt saved: ${receipt.id.substring(0, 8)}`);
        logger.setJsonData('receipt', receipt);

      } catch {
        logger.keyValue('Payment Header', paymentHeader);
      }
    }

    if (options.json) logger.outputJson();

  } catch (error: any) {
    spinner.fail('Request failed');

    if (error.response?.status === 402) {
      logger.error('Payment failed or was rejected');
      logger.setJsonData('error', 'Payment failed');

      const paymentRequiredHeader = error.response.headers['x-payment-required'];
      if (paymentRequiredHeader) {
        try {
          const requirements = JSON.parse(paymentRequiredHeader);
          logger.json(requirements);
          logger.setJsonData('paymentRequirements', requirements);
        } catch {
          logger.log(paymentRequiredHeader);
        }
      } else if (error.response.data) {
        logger.json(error.response.data);
        logger.setJsonData('paymentRequirements', error.response.data);
      }
    } else {
      logger.error(error.message);
      logger.setJsonData('error', error.message);
    }

    if (options.verbose && error.response) {
      logger.header('Full Error Response');
      logger.json({
        status: error.response.status,
        headers: error.response.headers,
        data: error.response.data
      });
    }

    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
