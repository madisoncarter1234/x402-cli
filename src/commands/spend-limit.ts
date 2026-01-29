import { logger } from '../utils/logger.js';
import { loadConfig, saveConfig, getConfigPath } from '../utils/config.js';
import { loadReceipts, type PaymentReceipt } from './receipt.js';
import ora from 'ora';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

interface SpendLimitOptions {
  set?: string;
  daily?: string;
  session?: string;
  reset?: boolean;
  json?: boolean;
}

interface SpendLimits {
  perTransaction?: number;
  daily?: number;
  session?: number;
  sessionStart?: string;
  sessionSpent?: number;
  dailySpent?: Record<string, number>; // date -> amount
}

const LIMITS_FILE = join(homedir(), '.x402', 'spend-limits.json');

function loadLimits(): SpendLimits {
  if (existsSync(LIMITS_FILE)) {
    try {
      return JSON.parse(readFileSync(LIMITS_FILE, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveLimits(limits: SpendLimits): void {
  const dir = join(homedir(), '.x402');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(LIMITS_FILE, JSON.stringify(limits, null, 2));
}

export function checkSpendLimit(amount: number): { allowed: boolean; reason?: string } {
  const limits = loadLimits();
  const today = new Date().toISOString().split('T')[0];

  // Check per-transaction limit
  if (limits.perTransaction && amount > limits.perTransaction) {
    return {
      allowed: false,
      reason: `Amount ${amount} exceeds per-transaction limit of ${limits.perTransaction}`
    };
  }

  // Check daily limit
  if (limits.daily) {
    const dailySpent = limits.dailySpent?.[today] || 0;
    if (dailySpent + amount > limits.daily) {
      return {
        allowed: false,
        reason: `Would exceed daily limit of ${limits.daily} (spent: ${dailySpent}, attempted: ${amount})`
      };
    }
  }

  // Check session limit
  if (limits.session) {
    const sessionSpent = limits.sessionSpent || 0;
    if (sessionSpent + amount > limits.session) {
      return {
        allowed: false,
        reason: `Would exceed session limit of ${limits.session} (spent: ${sessionSpent}, attempted: ${amount})`
      };
    }
  }

  return { allowed: true };
}

export function recordSpend(amount: number): void {
  const limits = loadLimits();
  const today = new Date().toISOString().split('T')[0];

  // Update daily spent
  if (!limits.dailySpent) {
    limits.dailySpent = {};
  }
  limits.dailySpent[today] = (limits.dailySpent[today] || 0) + amount;

  // Update session spent
  limits.sessionSpent = (limits.sessionSpent || 0) + amount;

  // Clean up old daily entries (keep last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

  for (const date of Object.keys(limits.dailySpent)) {
    if (date < cutoff) {
      delete limits.dailySpent[date];
    }
  }

  saveLimits(limits);
}

export async function spendLimitCommand(options: SpendLimitOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('Spend Limits');

  const spinner = ora();

  try {
    let limits = loadLimits();

    // Reset limits
    if (options.reset) {
      limits = {};
      saveLimits(limits);
      logger.success('All spend limits have been reset');
      logger.setJsonData('action', 'reset');
      if (options.json) logger.outputJson();
      return;
    }

    // Set per-transaction limit
    if (options.set) {
      const amount = parseFloat(options.set);
      if (isNaN(amount) || amount <= 0) {
        logger.error('Invalid amount. Please provide a positive number.');
        if (options.json) logger.outputJson();
        process.exit(1);
      }
      limits.perTransaction = amount;
      saveLimits(limits);
      logger.success(`Per-transaction limit set to ${amount} USDC`);
      logger.setJsonData('action', 'setPerTransaction');
      logger.setJsonData('perTransaction', amount);
    }

    // Set daily limit
    if (options.daily) {
      const amount = parseFloat(options.daily);
      if (isNaN(amount) || amount <= 0) {
        logger.error('Invalid amount. Please provide a positive number.');
        if (options.json) logger.outputJson();
        process.exit(1);
      }
      limits.daily = amount;
      saveLimits(limits);
      logger.success(`Daily limit set to ${amount} USDC`);
      logger.setJsonData('action', 'setDaily');
      logger.setJsonData('daily', amount);
    }

    // Set session limit
    if (options.session) {
      const amount = parseFloat(options.session);
      if (isNaN(amount) || amount <= 0) {
        logger.error('Invalid amount. Please provide a positive number.');
        if (options.json) logger.outputJson();
        process.exit(1);
      }
      limits.session = amount;
      limits.sessionStart = new Date().toISOString();
      limits.sessionSpent = 0;
      saveLimits(limits);
      logger.success(`Session limit set to ${amount} USDC (session reset)`);
      logger.setJsonData('action', 'setSession');
      logger.setJsonData('session', amount);
    }

    // If no action, show current limits
    if (!options.set && !options.daily && !options.session && !options.reset) {
      limits = loadLimits();
      const today = new Date().toISOString().split('T')[0];

      logger.header('Current Limits');

      if (limits.perTransaction) {
        logger.keyValue('Per Transaction', `${limits.perTransaction} USDC`);
      } else {
        logger.keyValue('Per Transaction', 'Not set (unlimited)');
      }

      if (limits.daily) {
        const dailySpent = limits.dailySpent?.[today] || 0;
        const remaining = limits.daily - dailySpent;
        logger.keyValue('Daily Limit', `${limits.daily} USDC`);
        logger.keyValue('Spent Today', `${dailySpent} USDC`);
        logger.keyValue('Remaining', `${remaining} USDC`);
      } else {
        logger.keyValue('Daily Limit', 'Not set (unlimited)');
      }

      if (limits.session) {
        const sessionSpent = limits.sessionSpent || 0;
        const remaining = limits.session - sessionSpent;
        logger.keyValue('Session Limit', `${limits.session} USDC`);
        logger.keyValue('Session Spent', `${sessionSpent} USDC`);
        logger.keyValue('Session Remaining', `${remaining} USDC`);
        if (limits.sessionStart) {
          logger.keyValue('Session Started', new Date(limits.sessionStart).toLocaleString());
        }
      } else {
        logger.keyValue('Session Limit', 'Not set (unlimited)');
      }

      logger.setJsonData('limits', {
        perTransaction: limits.perTransaction || null,
        daily: limits.daily || null,
        dailySpent: limits.dailySpent?.[today] || 0,
        session: limits.session || null,
        sessionSpent: limits.sessionSpent || 0,
        sessionStart: limits.sessionStart || null
      });

      // Show recent spending from receipts
      const receipts = loadReceipts();
      const recentReceipts = receipts
        .filter((r: PaymentReceipt) => r.status === 'success')
        .slice(0, 5);

      if (recentReceipts.length > 0) {
        logger.header('Recent Payments');
        for (const receipt of recentReceipts) {
          const date = new Date(receipt.timestamp).toLocaleDateString();
          logger.keyValue(date, `${receipt.amount} ${receipt.asset} → ${receipt.url.substring(0, 40)}...`);
        }
      }

      logger.log('\nUsage:');
      logger.log('  x402 spend-limit --set <amount>     Set per-transaction limit');
      logger.log('  x402 spend-limit --daily <amount>   Set daily spending limit');
      logger.log('  x402 spend-limit --session <amount> Set session spending limit');
      logger.log('  x402 spend-limit --reset            Clear all limits');
    }

    if (options.json) logger.outputJson();

  } catch (error: any) {
    spinner.fail('Failed to manage spend limits');
    logger.error(error.message);
    logger.setJsonData('error', error.message);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
