import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { logger } from '../utils/logger.js';

interface ReceiptOptions {
  list?: boolean;
  export?: string;
  json?: boolean;
}

export interface PaymentReceipt {
  id: string;
  timestamp: string;
  url: string;
  txHash?: string;
  network: string;
  amount: string;
  asset: string;
  from: string;
  to: string;
  status: 'success' | 'failed';
}

const RECEIPTS_DIR = join(homedir(), '.x402', 'receipts');
const RECEIPTS_FILE = join(RECEIPTS_DIR, 'receipts.json');

export function loadReceipts(): PaymentReceipt[] {
  if (!existsSync(RECEIPTS_FILE)) {
    return [];
  }
  try {
    return JSON.parse(readFileSync(RECEIPTS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

export function saveReceipt(receipt: PaymentReceipt): void {
  if (!existsSync(RECEIPTS_DIR)) {
    mkdirSync(RECEIPTS_DIR, { recursive: true });
  }

  const receipts = loadReceipts();
  receipts.push(receipt);
  writeFileSync(RECEIPTS_FILE, JSON.stringify(receipts, null, 2));
}

export async function receiptCommand(receiptId: string | undefined, options: ReceiptOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  const receipts = loadReceipts();

  // List all receipts
  if (options.list || !receiptId) {
    if (options.json) {
      logger.setJsonData('receipts', receipts);
      logger.outputJson();
      return;
    }

    logger.header('Payment Receipts');

    if (receipts.length === 0) {
      logger.info('No receipts found');
      logger.log('\nReceipts are saved automatically after successful payments.');
      return;
    }

    logger.log(`\nFound ${receipts.length} receipt(s):\n`);

    for (const receipt of receipts.slice(-20).reverse()) {
      const date = new Date(receipt.timestamp).toLocaleString();
      const status = receipt.status === 'success' ? '✓' : '✗';
      console.log(`${status} ${receipt.id.substring(0, 8)} | ${date} | ${receipt.amount} ${receipt.asset} | ${receipt.url}`);
    }

    if (receipts.length > 20) {
      logger.info(`\nShowing last 20 of ${receipts.length} receipts`);
    }

    logger.log('\nView details: x402 receipt <id>');
    return;
  }

  // Find specific receipt
  const receipt = receipts.find(r => r.id.startsWith(receiptId));

  if (!receipt) {
    logger.error(`Receipt not found: ${receiptId}`);
    process.exit(1);
  }

  // Export to file
  if (options.export) {
    const exportData = JSON.stringify(receipt, null, 2);
    writeFileSync(options.export, exportData);
    logger.success(`Receipt exported to ${options.export}`);
    return;
  }

  // Show receipt details
  if (options.json) {
    logger.setJsonData('receipt', receipt);
    logger.outputJson();
    return;
  }

  logger.header('Payment Receipt');
  logger.keyValue('ID', receipt.id);
  logger.keyValue('Timestamp', new Date(receipt.timestamp).toLocaleString());
  logger.keyValue('Status', receipt.status);
  logger.keyValue('URL', receipt.url);
  logger.keyValue('Network', receipt.network);
  logger.keyValue('Amount', `${receipt.amount} ${receipt.asset}`);
  logger.keyValue('From', receipt.from);
  logger.keyValue('To', receipt.to);

  if (receipt.txHash) {
    logger.keyValue('Transaction', receipt.txHash);
  }

  logger.log('\nExport: x402 receipt ' + receipt.id.substring(0, 8) + ' --export receipt.json');
}
