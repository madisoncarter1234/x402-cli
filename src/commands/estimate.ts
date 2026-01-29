import axios from 'axios';
import { logger } from '../utils/logger.js';
import { getPrivateKey, getNetwork, getRpcUrl, NETWORK_CHAIN_IDS, USDC_ADDRESSES } from '../utils/config.js';
import ora from 'ora';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, formatEther, formatUnits, parseUnits } from 'viem';
import { baseSepolia, base, mainnet, sepolia } from 'viem/chains';

interface EstimateOptions {
  key?: string;
  network?: string;
  json?: boolean;
}

const CHAINS: Record<string, any> = {
  'base': base,
  'base-mainnet': base,
  'base-sepolia': baseSepolia,
  'ethereum': mainnet,
  'mainnet': mainnet,
  'sepolia': sepolia
};

export async function estimateCommand(url: string, options: EstimateOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('Payment Estimate');
  logger.info(`Target: ${url}`);

  const spinner = ora();

  try {
    // Fetch payment requirements
    spinner.start('Fetching payment requirements');

    const response = await axios.get(url, {
      validateStatus: (status) => status === 402 || status === 200
    });

    if (response.status === 200) {
      spinner.succeed('Endpoint is publicly accessible (no payment required)');
      logger.setJsonData('paymentRequired', false);
      logger.setJsonData('totalCost', '0');
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

    if (!accepts[0]) {
      logger.error('No payment requirements found');
      if (options.json) logger.outputJson();
      process.exit(1);
    }

    const req = accepts[0];
    const paymentAmount = req.maxAmountRequired || req.amount || '0';
    const asset = req.asset || 'USDC';
    const payTo = req.payTo || req.recipient;
    const reqNetwork = req.network;

    // Determine network
    const networkName = options.network || getNetwork();
    const chain = CHAINS[networkName.toLowerCase()];

    logger.header('Payment Details');
    logger.keyValue('Amount', `${paymentAmount} ${asset}`);
    logger.keyValue('Recipient', payTo);
    logger.keyValue('Network', networkName);

    logger.setJsonData('payment', {
      amount: paymentAmount,
      asset,
      recipient: payTo,
      network: networkName
    });

    // Estimate gas costs
    if (chain) {
      spinner.start('Estimating gas costs');

      const client = createPublicClient({
        chain,
        transport: http(getRpcUrl(networkName))
      });

      try {
        const gasPrice = await client.getGasPrice();

        // Estimate gas for USDC transfer (EIP-3009 authorization ~65k gas)
        const estimatedGas = BigInt(65000);
        const gasCost = gasPrice * estimatedGas;
        const gasCostEth = formatEther(gasCost);

        spinner.succeed('Gas estimated');

        logger.header('Gas Estimate');
        logger.keyValue('Gas Price', `${formatUnits(gasPrice, 9)} gwei`);
        logger.keyValue('Estimated Gas', estimatedGas.toString());
        logger.keyValue('Gas Cost', `~${parseFloat(gasCostEth).toFixed(6)} ETH`);

        logger.setJsonData('gas', {
          gasPrice: gasPrice.toString(),
          gasPriceGwei: formatUnits(gasPrice, 9),
          estimatedGas: estimatedGas.toString(),
          gasCostWei: gasCost.toString(),
          gasCostEth: gasCostEth
        });

        // Total cost calculation
        logger.header('Total Estimated Cost');

        // Parse payment amount (assuming USDC with 6 decimals or raw value)
        let paymentAmountFormatted: string;
        if (asset.toUpperCase() === 'USDC') {
          // If it looks like raw units (> 1000), format it
          const amountNum = parseFloat(paymentAmount);
          if (amountNum > 1000) {
            paymentAmountFormatted = formatUnits(BigInt(paymentAmount), 6);
          } else {
            paymentAmountFormatted = paymentAmount;
          }
        } else {
          paymentAmountFormatted = paymentAmount;
        }

        logger.keyValue('Payment', `${paymentAmountFormatted} ${asset}`);
        logger.keyValue('Gas', `~${parseFloat(gasCostEth).toFixed(6)} ETH`);
        logger.log('');
        logger.info('Note: Actual gas may vary based on network conditions');

        logger.setJsonData('totalEstimate', {
          paymentAmount: paymentAmountFormatted,
          paymentAsset: asset,
          gasCostEth: parseFloat(gasCostEth).toFixed(6)
        });

        // Check if user has sufficient balance
        const privateKey = getPrivateKey(options.key);
        if (privateKey) {
          const formattedKey = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
          const account = privateKeyToAccount(formattedKey);

          spinner.start('Checking wallet balance');

          const ethBalance = await client.getBalance({ address: account.address });

          spinner.succeed('Balance checked');

          const hasEnoughGas = ethBalance > gasCost;

          logger.header('Wallet Check');
          logger.keyValue('Address', account.address);
          logger.keyValue('ETH Balance', formatEther(ethBalance));
          logger.keyValue('Sufficient for Gas', hasEnoughGas ? '✓ Yes' : '✗ No');

          logger.setJsonData('wallet', {
            address: account.address,
            ethBalance: formatEther(ethBalance),
            sufficientForGas: hasEnoughGas
          });

          if (!hasEnoughGas) {
            logger.warn(`Need ~${gasCostEth} ETH for gas. Run 'x402 fund' to get testnet ETH.`);
          }
        }

      } catch (e: any) {
        spinner.warn(`Could not estimate gas: ${e.message}`);
      }
    }

    if (options.json) logger.outputJson();

  } catch (error: any) {
    spinner.fail('Estimation failed');
    logger.error(error.message);
    logger.setJsonData('error', error.message);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
