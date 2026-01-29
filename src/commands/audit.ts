import { logger } from '../utils/logger.js';
import { getNetwork, getRpcUrl, USDC_ADDRESSES } from '../utils/config.js';
import ora from 'ora';
import { createPublicClient, http, parseAbiItem, formatUnits } from 'viem';
import { baseSepolia, base, mainnet, sepolia } from 'viem/chains';

interface AuditOptions {
  network?: string;
  blocks?: string;
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

export async function auditCommand(address: string, options: AuditOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('x402 Payment Audit');
  logger.info(`Address: ${address}`);

  const spinner = ora();

  try {
    const networkName = getNetwork(options.network);
    const chain = CHAINS[networkName.toLowerCase()];

    if (!chain) {
      logger.error(`Unsupported network: ${networkName}`);
      logger.info('Supported networks: base, base-sepolia, ethereum, sepolia');
      if (options.json) logger.outputJson();
      process.exit(1);
    }

    logger.info(`Network: ${networkName}`);
    logger.setJsonData('address', address);
    logger.setJsonData('network', networkName);

    const client = createPublicClient({
      chain,
      transport: http(getRpcUrl(networkName))
    });

    const usdcAddress = USDC_ADDRESSES[networkName.toLowerCase()];
    if (!usdcAddress) {
      logger.error(`USDC not configured for ${networkName}`);
      if (options.json) logger.outputJson();
      process.exit(1);
    }

    const blocksToScan = parseInt(options.blocks || '10000');

    // Get current block
    spinner.start('Fetching blockchain data');

    const latestBlock = await client.getBlockNumber();
    const fromBlock = latestBlock - BigInt(blocksToScan);

    spinner.text = `Scanning blocks ${fromBlock.toString()} to ${latestBlock.toString()}`;

    const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

    // Get outgoing transfers (payments made)
    const outgoingLogs = await client.getLogs({
      address: usdcAddress,
      event: transferEvent,
      args: { from: address as `0x${string}` },
      fromBlock,
      toBlock: latestBlock
    });

    // Get incoming transfers (payments received)
    const incomingLogs = await client.getLogs({
      address: usdcAddress,
      event: transferEvent,
      args: { to: address as `0x${string}` },
      fromBlock,
      toBlock: latestBlock
    });

    spinner.succeed(`Found ${outgoingLogs.length} outgoing and ${incomingLogs.length} incoming transfers`);

    // Process outgoing (payments made)
    const outgoing = outgoingLogs.map(log => ({
      txHash: log.transactionHash,
      to: log.args.to,
      amount: formatUnits(log.args.value || BigInt(0), 6),
      amountRaw: (log.args.value || BigInt(0)).toString(),
      blockNumber: log.blockNumber?.toString()
    }));

    // Process incoming (payments received)
    const incoming = incomingLogs.map(log => ({
      txHash: log.transactionHash,
      from: log.args.from,
      amount: formatUnits(log.args.value || BigInt(0), 6),
      amountRaw: (log.args.value || BigInt(0)).toString(),
      blockNumber: log.blockNumber?.toString()
    }));

    // Calculate totals
    const totalOut = outgoing.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
    const totalIn = incoming.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

    // Group by recipient/sender
    const recipientCounts: Record<string, { count: number; total: number }> = {};
    for (const tx of outgoing) {
      const addr = tx.to || 'unknown';
      if (!recipientCounts[addr]) {
        recipientCounts[addr] = { count: 0, total: 0 };
      }
      recipientCounts[addr].count++;
      recipientCounts[addr].total += parseFloat(tx.amount);
    }

    const senderCounts: Record<string, { count: number; total: number }> = {};
    for (const tx of incoming) {
      const addr = tx.from || 'unknown';
      if (!senderCounts[addr]) {
        senderCounts[addr] = { count: 0, total: 0 };
      }
      senderCounts[addr].count++;
      senderCounts[addr].total += parseFloat(tx.amount);
    }

    // Display results
    logger.header('Summary');
    logger.keyValue('Blocks Scanned', blocksToScan.toString());
    logger.keyValue('Outgoing Transfers', outgoing.length.toString());
    logger.keyValue('Incoming Transfers', incoming.length.toString());
    logger.keyValue('Total Sent', `${totalOut.toFixed(6)} USDC`);
    logger.keyValue('Total Received', `${totalIn.toFixed(6)} USDC`);
    logger.keyValue('Net Flow', `${(totalIn - totalOut).toFixed(6)} USDC`);

    // Top recipients
    if (Object.keys(recipientCounts).length > 0) {
      logger.header('Top Payment Recipients');

      const topRecipients = Object.entries(recipientCounts)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10);

      for (const [addr, data] of topRecipients) {
        logger.keyValue(
          `${addr.substring(0, 10)}...${addr.substring(addr.length - 6)}`,
          `${data.total.toFixed(4)} USDC (${data.count} txns)`
        );
      }
    }

    // Top senders
    if (Object.keys(senderCounts).length > 0) {
      logger.header('Top Payment Sources');

      const topSenders = Object.entries(senderCounts)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10);

      for (const [addr, data] of topSenders) {
        logger.keyValue(
          `${addr.substring(0, 10)}...${addr.substring(addr.length - 6)}`,
          `${data.total.toFixed(4)} USDC (${data.count} txns)`
        );
      }
    }

    // Recent transactions
    if (outgoing.length > 0) {
      logger.header('Recent Outgoing (Last 5)');

      for (const tx of outgoing.slice(-5).reverse()) {
        logger.log('');
        logger.keyValue('TX', tx.txHash?.substring(0, 20) + '...');
        logger.keyValue('To', tx.to || 'unknown');
        logger.keyValue('Amount', `${tx.amount} USDC`);
        logger.keyValue('Block', tx.blockNumber || 'unknown');
      }
    }

    // Risk indicators
    logger.header('Risk Assessment');

    const riskFlags: string[] = [];

    // High volume
    if (outgoing.length > 100) {
      riskFlags.push('High transaction volume (>100 transfers)');
    }

    // Large payments
    const largePayments = outgoing.filter(tx => parseFloat(tx.amount) > 100);
    if (largePayments.length > 0) {
      riskFlags.push(`${largePayments.length} large payments (>$100)`);
    }

    // Single recipient concentration
    const topRecipient = Object.values(recipientCounts).sort((a, b) => b.total - a.total)[0];
    if (topRecipient && totalOut > 0 && (topRecipient.total / totalOut) > 0.8) {
      riskFlags.push('High concentration to single recipient (>80%)');
    }

    if (riskFlags.length === 0) {
      logger.success('No risk indicators detected');
    } else {
      for (const flag of riskFlags) {
        logger.warn(flag);
      }
    }

    logger.setJsonData('audit', {
      address,
      network: networkName,
      blocksScanned: blocksToScan,
      outgoing: {
        count: outgoing.length,
        total: totalOut,
        transactions: outgoing.slice(-20) // Last 20
      },
      incoming: {
        count: incoming.length,
        total: totalIn,
        transactions: incoming.slice(-20)
      },
      netFlow: totalIn - totalOut,
      topRecipients: Object.fromEntries(
        Object.entries(recipientCounts).sort((a, b) => b[1].total - a[1].total).slice(0, 10)
      ),
      topSenders: Object.fromEntries(
        Object.entries(senderCounts).sort((a, b) => b[1].total - a[1].total).slice(0, 10)
      ),
      riskFlags
    });

    if (options.json) logger.outputJson();

  } catch (error: any) {
    spinner.fail('Audit failed');
    logger.error(error.message);
    logger.setJsonData('error', error.message);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
