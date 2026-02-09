import { logger } from '../utils/logger.js';
import { loadReceipts, type PaymentReceipt } from './receipt.js';
import ora from 'ora';

interface StatsOptions {
  period?: string;
  json?: boolean;
}

export async function statsCommand(options: StatsOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('x402 Usage Statistics');

  const spinner = ora();

  try {
    spinner.start('Loading payment history');

    const receipts = loadReceipts();

    if (receipts.length === 0) {
      spinner.succeed('No payment history found');
      logger.info('Make some payments with x402 test <url> to see stats');
      logger.setJsonData('totalPayments', 0);
      if (options.json) logger.outputJson();
      return;
    }

    spinner.succeed(`Loaded ${receipts.length} receipts`);

    // Filter by period
    let filteredReceipts = receipts;
    const now = new Date();
    let periodLabel = 'All Time';

    if (options.period) {
      const period = options.period.toLowerCase();
      let cutoff: Date;

      switch (period) {
        case 'today':
          cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          periodLabel = 'Today';
          break;
        case 'week':
          cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          periodLabel = 'Last 7 Days';
          break;
        case 'month':
          cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          periodLabel = 'Last 30 Days';
          break;
        default:
          cutoff = new Date(0);
      }

      filteredReceipts = receipts.filter((r: PaymentReceipt) => new Date(r.timestamp) >= cutoff);
    }

    logger.info(`Period: ${periodLabel}`);
    logger.setJsonData('period', periodLabel);

    // Calculate statistics
    const successful = filteredReceipts.filter((r: PaymentReceipt) => r.status === 'success');
    const failed = filteredReceipts.filter((r: PaymentReceipt) => r.status !== 'success');

    // Spending by asset
    const spendingByAsset: Record<string, number> = {};
    for (const receipt of successful) {
      const asset = receipt.asset || 'UNKNOWN';
      const amount = parseFloat(receipt.amount) || 0;
      spendingByAsset[asset] = (spendingByAsset[asset] || 0) + amount;
    }

    // Spending by network
    const spendingByNetwork: Record<string, number> = {};
    const countByNetwork: Record<string, number> = {};
    for (const receipt of successful) {
      const network = receipt.network || 'unknown';
      const amount = parseFloat(receipt.amount) || 0;
      spendingByNetwork[network] = (spendingByNetwork[network] || 0) + amount;
      countByNetwork[network] = (countByNetwork[network] || 0) + 1;
    }

    // Unique endpoints
    const uniqueEndpoints = new Set(filteredReceipts.map((r: PaymentReceipt) => {
      try {
        const url = new URL(r.url);
        return url.hostname;
      } catch {
        return r.url;
      }
    }));

    // Top endpoints by spend
    const spendByEndpoint: Record<string, { count: number; spent: number }> = {};
    for (const receipt of successful) {
      let host: string;
      try {
        host = new URL(receipt.url).hostname;
      } catch {
        host = receipt.url;
      }

      if (!spendByEndpoint[host]) {
        spendByEndpoint[host] = { count: 0, spent: 0 };
      }
      spendByEndpoint[host].count++;
      spendByEndpoint[host].spent += parseFloat(receipt.amount) || 0;
    }

    const topEndpoints = Object.entries(spendByEndpoint)
      .sort((a, b) => b[1].spent - a[1].spent)
      .slice(0, 5);

    // Daily spending trend
    const dailySpending: Record<string, number> = {};
    for (const receipt of successful) {
      const date = receipt.timestamp.split('T')[0];
      const amount = parseFloat(receipt.amount) || 0;
      dailySpending[date] = (dailySpending[date] || 0) + amount;
    }

    // Display statistics
    logger.header('Overview');
    logger.keyValue('Total Payments', filteredReceipts.length.toString());
    logger.keyValue('Successful', successful.length.toString());
    logger.keyValue('Failed', failed.length.toString());
    logger.keyValue('Success Rate', `${((successful.length / filteredReceipts.length) * 100).toFixed(1)}%`);
    logger.keyValue('Unique Endpoints', uniqueEndpoints.size.toString());

    logger.header('Spending by Asset');
    let totalSpent = 0;
    for (const [asset, amount] of Object.entries(spendingByAsset)) {
      logger.keyValue(asset, amount.toFixed(6));
      totalSpent += amount;
    }
    logger.keyValue('Total (estimated)', totalSpent.toFixed(6));

    logger.header('Spending by Network');
    for (const [network, amount] of Object.entries(spendingByNetwork)) {
      const count = countByNetwork[network];
      logger.keyValue(network, `${amount.toFixed(6)} (${count} txns)`);
    }

    if (topEndpoints.length > 0) {
      logger.header('Top Endpoints');
      for (const [host, data] of topEndpoints) {
        logger.keyValue(host, `${data.spent.toFixed(6)} (${data.count} calls)`);
      }
    }

    // Recent daily trend
    const recentDays = Object.entries(dailySpending)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 7)
      .reverse();

    if (recentDays.length > 1) {
      logger.header('Daily Trend (Last 7 Days)');
      for (const [date, amount] of recentDays) {
        const bar = '█'.repeat(Math.min(20, Math.ceil(amount / (totalSpent / 20) || 1)));
        logger.log(`  ${date}: ${bar} ${amount.toFixed(4)}`);
      }
    }

    // Time statistics
    if (filteredReceipts.length > 0) {
      const timestamps = filteredReceipts.map((r: PaymentReceipt) => new Date(r.timestamp).getTime());
      const firstPayment = new Date(Math.min(...timestamps));
      const lastPayment = new Date(Math.max(...timestamps));

      logger.header('Time Range');
      logger.keyValue('First Payment', firstPayment.toLocaleString());
      logger.keyValue('Last Payment', lastPayment.toLocaleString());

      const daysDiff = Math.ceil((lastPayment.getTime() - firstPayment.getTime()) / (1000 * 60 * 60 * 24)) || 1;
      logger.keyValue('Avg per Day', (filteredReceipts.length / daysDiff).toFixed(2));
    }

    // Set JSON data
    logger.setJsonData('stats', {
      totalPayments: filteredReceipts.length,
      successful: successful.length,
      failed: failed.length,
      successRate: (successful.length / filteredReceipts.length) * 100,
      uniqueEndpoints: uniqueEndpoints.size,
      spendingByAsset,
      spendingByNetwork,
      topEndpoints: Object.fromEntries(topEndpoints),
      dailySpending,
      totalSpent
    });

    if (options.json) logger.outputJson();

  } catch (error: any) {
    spinner.fail('Failed to load statistics');
    logger.error(error.message);
    logger.setJsonData('error', error.message);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
