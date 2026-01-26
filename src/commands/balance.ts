import { logger } from '../utils/logger.js';
import { getPrivateKey, getNetwork, getRpcUrl, USDC_ADDRESSES } from '../utils/config.js';
import ora from 'ora';
import { createPublicClient, http, formatUnits, formatEther, type Chain } from 'viem';
import { base, baseSepolia, mainnet, sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

interface BalanceOptions {
  key?: string;
  network?: string;
  address?: string;
  json?: boolean;
}

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

// ERC20 balanceOf ABI
const erc20Abi = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

export async function balanceCommand(options: BalanceOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  const networkName = getNetwork(options.network);

  logger.header('Wallet Balance');
  logger.info(`Network: ${networkName}`);

  const spinner = ora();

  try {
    let address: `0x${string}`;

    if (options.address) {
      // Use provided address
      address = options.address as `0x${string}`;
    } else {
      // Derive from private key
      const privateKey = getPrivateKey(options.key);
      if (!privateKey) {
        logger.error('Address or private key required. Use --address or --key flag');
        if (options.json) logger.outputJson();
        process.exit(1);
      }
      const formattedKey = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
      const account = privateKeyToAccount(formattedKey);
      address = account.address;
    }

    logger.info(`Address: ${address}`);
    logger.setJsonData('address', address);
    logger.setJsonData('network', networkName);

    spinner.start('Fetching balances');

    const chain = getChain(networkName);
    const rpcUrl = getRpcUrl(networkName);

    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl)
    });

    // Get ETH balance
    const ethBalance = await publicClient.getBalance({ address });
    const ethFormatted = formatEther(ethBalance);

    // Get USDC balance
    const usdcAddress = USDC_ADDRESSES[networkName.toLowerCase()];
    let usdcFormatted = '0';

    if (usdcAddress) {
      try {
        const usdcBalance = await publicClient.readContract({
          address: usdcAddress,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address]
        });
        usdcFormatted = formatUnits(usdcBalance, 6);
      } catch {
        // USDC contract might not exist on this network
      }
    }

    spinner.succeed('Balances retrieved');

    logger.header('Balances');
    logger.keyValue('ETH', `${ethFormatted} ETH`);
    logger.keyValue('USDC', `${usdcFormatted} USDC`);

    logger.setJsonData('balances', {
      eth: ethFormatted,
      usdc: usdcFormatted
    });

    if (options.json) {
      logger.outputJson();
    }

  } catch (error: any) {
    spinner.fail('Failed to fetch balance');
    logger.error(error.message);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
