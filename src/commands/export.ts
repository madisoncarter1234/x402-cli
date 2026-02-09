import { writeFileSync } from 'fs';
import { logger } from '../utils/logger.js';
import { loadReceipts, type PaymentReceipt } from './receipt.js';

interface ExportOptions {
  output?: string;
  format?: string;
  from?: string;
  to?: string;
  network?: string;
  status?: string;
  json?: boolean;
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function receiptToCSVRow(receipt: PaymentReceipt): string {
  return [
    escapeCSV(receipt.id),
    escapeCSV(receipt.timestamp),
    escapeCSV(receipt.url),
    escapeCSV(receipt.network),
    escapeCSV(receipt.amount),
    escapeCSV(receipt.asset),
    escapeCSV(receipt.from),
    escapeCSV(receipt.to),
    escapeCSV(receipt.status),
    escapeCSV(receipt.txHash || '')
  ].join(',');
}

const CSV_HEADER = 'id,timestamp,url,network,amount,asset,from,to,status,txHash';

function filterReceipts(receipts: PaymentReceipt[], options: ExportOptions): PaymentReceipt[] {
  let filtered = receipts;

  if (options.from) {
    const fromDate = new Date(options.from);
    if (!isNaN(fromDate.getTime())) {
      filtered = filtered.filter(r => new Date(r.timestamp) >= fromDate);
    }
  }

  if (options.to) {
    const toDate = new Date(options.to);
    if (!isNaN(toDate.getTime())) {
      filtered = filtered.filter(r => new Date(r.timestamp) <= toDate);
    }
  }

  if (options.network) {
    const net = options.network.toLowerCase();
    filtered = filtered.filter(r => r.network.toLowerCase() === net);
  }

  if (options.status) {
    filtered = filtered.filter(r => r.status === options.status);
  }

  return filtered;
}

export async function exportCommand(options: ExportOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('Export Payment History');

  const allReceipts = loadReceipts();

  if (allReceipts.length === 0) {
    logger.info('No receipts found. Make some payments first with: x402 test <url>');
    logger.setJsonData('exported', 0);
    if (options.json) logger.outputJson();
    return;
  }

  const receipts = filterReceipts(allReceipts, options);

  logger.info(`Found ${receipts.length} receipts (${allReceipts.length} total)`);

  if (receipts.length === 0) {
    logger.warn('No receipts match your filters');
    if (options.json) logger.outputJson();
    return;
  }

  const format = (options.format || 'csv').toLowerCase();
  const defaultFilename = format === 'json' ? 'x402-receipts.json' : 'x402-receipts.csv';
  const outputPath = options.output || defaultFilename;

  let content: string;

  if (format === 'json') {
    content = JSON.stringify(receipts, null, 2);
  } else {
    const rows = receipts.map(receiptToCSVRow);
    content = CSV_HEADER + '\n' + rows.join('\n') + '\n';
  }

  writeFileSync(outputPath, content);

  logger.success(`Exported ${receipts.length} receipts to ${outputPath}`);
  logger.keyValue('Format', format.toUpperCase());
  logger.keyValue('Records', receipts.length.toString());
  logger.keyValue('File', outputPath);

  // Show summary stats
  const successful = receipts.filter(r => r.status === 'success');
  const totalSpent = successful.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  const networks = [...new Set(receipts.map(r => r.network))];

  logger.header('Summary');
  logger.keyValue('Successful', `${successful.length} / ${receipts.length}`);
  logger.keyValue('Total spent', `~${totalSpent.toFixed(6)}`);
  logger.keyValue('Networks', networks.join(', '));

  if (receipts.length > 0) {
    const oldest = new Date(receipts[0].timestamp);
    const newest = new Date(receipts[receipts.length - 1].timestamp);
    logger.keyValue('Date range', `${oldest.toLocaleDateString()} - ${newest.toLocaleDateString()}`);
  }

  logger.setJsonData('exported', receipts.length);
  logger.setJsonData('file', outputPath);
  logger.setJsonData('format', format);
  logger.setJsonData('summary', {
    total: receipts.length,
    successful: successful.length,
    totalSpent,
    networks
  });

  if (options.json) logger.outputJson();
}
