import { logger } from '../utils/logger.js';
import { getPrivateKey, getNetwork, getRpcUrl, USDC_ADDRESSES } from '../utils/config.js';
import ora from 'ora';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, http, formatUnits, parseUnits } from 'viem';
import { baseSepolia, base, mainnet, sepolia } from 'viem/chains';

interface AllowanceOptions {
  key?: string;
  network?: string;
  spender?: string;
  amount?: string;
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

// Known facilitator/spender addresses
const KNOWN_SPENDERS: Record<string, Record<string, string>> = {
  'base-sepolia': {
    'x402-facilitator': '0x0000000000000000000000000000000000000000' // placeholder
  }
};

const ERC20_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  }
] as const;

export async function allowanceCommand(options: AllowanceOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('USDC Allowance');

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
    const chain = CHAINS[networkName.toLowerCase()];

    if (!chain) {
      logger.error(`Unsupported network: ${networkName}`);
      if (options.json) logger.outputJson();
      process.exit(1);
    }

    const usdcAddress = USDC_ADDRESSES[networkName.toLowerCase()];
    if (!usdcAddress) {
      logger.error(`USDC not configured for network: ${networkName}`);
      if (options.json) logger.outputJson();
      process.exit(1);
    }

    logger.info(`Wallet: ${account.address}`);
    logger.info(`Network: ${networkName}`);
    logger.info(`USDC: ${usdcAddress}`);

    logger.setJsonData('wallet', account.address);
    logger.setJsonData('network', networkName);
    logger.setJsonData('usdcAddress', usdcAddress);

    const publicClient = createPublicClient({
      chain,
      transport: http(getRpcUrl(networkName))
    });

    // If setting new allowance
    if (options.amount && options.spender) {
      const spenderAddress = options.spender as `0x${string}`;
      const amountRaw = options.amount === 'max'
        ? BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
        : parseUnits(options.amount, 6);

      logger.header('Setting Allowance');
      logger.keyValue('Spender', spenderAddress);
      logger.keyValue('Amount', options.amount === 'max' ? 'Unlimited' : `${options.amount} USDC`);

      spinner.start('Sending approval transaction');

      const walletClient = createWalletClient({
        account,
        chain,
        transport: http(getRpcUrl(networkName))
      });

      const hash = await walletClient.writeContract({
        chain,
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spenderAddress, amountRaw]
      });

      spinner.succeed(`Approval submitted: ${hash}`);

      logger.setJsonData('transaction', {
        hash,
        spender: spenderAddress,
        amount: options.amount
      });

      // Wait for confirmation
      spinner.start('Waiting for confirmation');

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        spinner.succeed('Allowance set successfully');
        logger.setJsonData('status', 'success');
      } else {
        spinner.fail('Transaction failed');
        logger.setJsonData('status', 'failed');
      }

    } else {
      // Check current allowances
      spinner.start('Checking allowances');

      const spendersToCheck: { name: string; address: string }[] = [];

      // Add user-specified spender
      if (options.spender) {
        spendersToCheck.push({ name: 'specified', address: options.spender });
      }

      // Add known spenders for this network
      const networkSpenders = KNOWN_SPENDERS[networkName.toLowerCase()] || {};
      for (const [name, addr] of Object.entries(networkSpenders)) {
        if (addr !== '0x0000000000000000000000000000000000000000') {
          spendersToCheck.push({ name, address: addr });
        }
      }

      if (spendersToCheck.length === 0) {
        spinner.succeed('No spenders configured to check');
        logger.info('Use --spender <address> to check a specific spender');
        logger.info('Use --spender <address> --amount <amount> to set allowance');
        if (options.json) logger.outputJson();
        return;
      }

      spinner.succeed('Checking allowances');

      logger.header('Current Allowances');

      const allowances: any[] = [];

      for (const spender of spendersToCheck) {
        try {
          const allowance = await publicClient.readContract({
            address: usdcAddress,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [account.address, spender.address as `0x${string}`]
          });

          const formatted = allowance === BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
            ? 'Unlimited'
            : `${formatUnits(allowance, 6)} USDC`;

          logger.keyValue(spender.name, `${formatted} (${spender.address.substring(0, 10)}...)`);

          allowances.push({
            name: spender.name,
            address: spender.address,
            allowance: allowance.toString(),
            formatted
          });
        } catch (e: any) {
          logger.keyValue(spender.name, `Error: ${e.message}`);
        }
      }

      logger.setJsonData('allowances', allowances);
    }

    if (options.json) logger.outputJson();

  } catch (error: any) {
    spinner.fail('Allowance operation failed');
    logger.error(error.message);
    logger.setJsonData('error', error.message);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
