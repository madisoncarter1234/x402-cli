import { logger } from '../utils/logger.js';
import { getPrivateKey, getNetwork, getRpcUrl, NETWORK_CHAIN_IDS, USDC_ADDRESSES } from '../utils/config.js';
import { loadReceipts, type PaymentReceipt } from './receipt.js';
import ora from 'ora';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, parseAbiItem, formatUnits } from 'viem';
import { baseSepolia, base, mainnet, sepolia } from 'viem/chains';

interface HistoryOptions {
  key?: string;
  address?: string;
  network?: string;
  limit?: string;
  onchain?: boolean;
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

export async function historyCommand(options: HistoryOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('Payment History');

  const spinner = ora();
  const limit = parseInt(options.limit || '20');

  try {
    let address: string;

    if (options.address) {
      address = options.address;
    } else {
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

    logger.info(`Wallet: ${address}`);
    logger.setJsonData('wallet', address);

    // First show local receipts
    spinner.start('Loading local payment receipts');
    const receipts = loadReceipts();
    const walletReceipts = receipts.filter((r: PaymentReceipt) =>
      r.from.toLowerCase() === address.toLowerCase()
    ).slice(0, limit);

    spinner.succeed(`Found ${walletReceipts.length} local receipts`);

    if (walletReceipts.length > 0) {
      logger.header('Local Receipts');
      logger.setJsonData('localReceipts', walletReceipts);

      for (const receipt of walletReceipts) {
        logger.log('');
        logger.keyValue('ID', receipt.id.substring(0, 8));
        logger.keyValue('Date', new Date(receipt.timestamp).toLocaleString());
        logger.keyValue('URL', receipt.url);
        logger.keyValue('Amount', `${receipt.amount} ${receipt.asset}`);
        logger.keyValue('Network', receipt.network);
        logger.keyValue('Status', receipt.status);
        if (receipt.txHash) {
          logger.keyValue('TX', receipt.txHash.substring(0, 20) + '...');
        }
      }
    }

    // Optionally fetch on-chain transfer history
    if (options.onchain) {
      const networkName = getNetwork(options.network);
      const chain = CHAINS[networkName.toLowerCase()];

      if (!chain) {
        logger.warn(`Chain ${networkName} not supported for on-chain history`);
      } else {
        spinner.start(`Fetching on-chain USDC transfers on ${networkName}`);

        const client = createPublicClient({
          chain,
          transport: http(getRpcUrl(networkName))
        });

        const usdcAddress = USDC_ADDRESSES[networkName.toLowerCase()];

        if (usdcAddress) {
          try {
            // Get recent blocks (last ~1000 blocks)
            const latestBlock = await client.getBlockNumber();
            const fromBlock = latestBlock - BigInt(1000);

            const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

            const logs = await client.getLogs({
              address: usdcAddress,
              event: transferEvent,
              args: { from: address as `0x${string}` },
              fromBlock,
              toBlock: latestBlock
            });

            spinner.succeed(`Found ${logs.length} on-chain USDC transfers`);

            if (logs.length > 0) {
              logger.header('On-Chain USDC Transfers');

              const transfers = logs.slice(0, limit).map(log => ({
                txHash: log.transactionHash,
                to: log.args.to,
                amount: formatUnits(log.args.value || BigInt(0), 6),
                block: log.blockNumber?.toString()
              }));

              logger.setJsonData('onchainTransfers', transfers);

              for (const tx of transfers) {
                logger.log('');
                logger.keyValue('TX', tx.txHash?.substring(0, 20) + '...');
                logger.keyValue('To', tx.to || 'unknown');
                logger.keyValue('Amount', `${tx.amount} USDC`);
                logger.keyValue('Block', tx.block || 'unknown');
              }
            }
          } catch (e: any) {
            spinner.warn(`Could not fetch on-chain history: ${e.message}`);
          }
        }
      }
    }

    // Summary
    if (walletReceipts.length > 0) {
      const totalSpent = walletReceipts
        .filter((r: PaymentReceipt) => r.status === 'success')
        .reduce((sum: number, r: PaymentReceipt) => {
          const amount = parseFloat(r.amount) || 0;
          return sum + amount;
        }, 0);

      logger.header('Summary');
      logger.keyValue('Total Payments', walletReceipts.length.toString());
      logger.keyValue('Successful', walletReceipts.filter((r: PaymentReceipt) => r.status === 'success').length.toString());
      logger.keyValue('Total Spent', `~${totalSpent.toFixed(6)} (estimated)`);

      logger.setJsonData('summary', {
        totalPayments: walletReceipts.length,
        successful: walletReceipts.filter(r => r.status === 'success').length,
        estimatedSpent: totalSpent
      });
    }

    if (options.json) logger.outputJson();

  } catch (error: any) {
    spinner.fail('Failed to fetch history');
    logger.error(error.message);
    logger.setJsonData('error', error.message);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
