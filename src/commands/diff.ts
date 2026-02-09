import axios from 'axios';
import { logger } from '../utils/logger.js';
import ora from 'ora';

interface DiffOptions {
  interval?: string;
  count?: string;
  json?: boolean;
}

interface PaymentRequirements {
  amount?: string;
  maxAmountRequired?: string;
  asset?: string;
  payTo?: string;
  recipient?: string;
  network?: string;
  [key: string]: any;
}

function extractRequirements(response: any): PaymentRequirements | null {
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

  const accepts = paymentData?.accepts || paymentData?.paymentRequirements || [];
  return accepts[0] || null;
}

function diffObjects(a: any, b: any, path = ''): string[] {
  const diffs: string[] = [];

  const allKeys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);

  for (const key of allKeys) {
    const currentPath = path ? `${path}.${key}` : key;
    const aVal = a?.[key];
    const bVal = b?.[key];

    if (aVal === undefined && bVal !== undefined) {
      diffs.push(`+ ${currentPath}: ${JSON.stringify(bVal)}`);
    } else if (aVal !== undefined && bVal === undefined) {
      diffs.push(`- ${currentPath}: ${JSON.stringify(aVal)}`);
    } else if (typeof aVal === 'object' && typeof bVal === 'object') {
      diffs.push(...diffObjects(aVal, bVal, currentPath));
    } else if (aVal !== bVal) {
      diffs.push(`~ ${currentPath}: ${JSON.stringify(aVal)} → ${JSON.stringify(bVal)}`);
    }
  }

  return diffs;
}

export async function diffCommand(url: string, options: DiffOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('Payment Requirements Diff');
  logger.info(`Monitoring: ${url}`);

  const spinner = ora();
  const interval = parseInt(options.interval || '5') * 1000;
  const maxCount = options.count ? parseInt(options.count) : Infinity;

  let previousRequirements: PaymentRequirements | null = null;
  let checkCount = 0;
  const changes: any[] = [];

  try {
    // Initial fetch
    spinner.start('Fetching initial payment requirements');

    const initialResponse = await axios.get(url, {
      validateStatus: (status) => status === 402 || status === 200
    });

    if (initialResponse.status === 200) {
      spinner.succeed('Endpoint is publicly accessible (no 402)');
      logger.info('No payment requirements to diff');
      logger.setJsonData('publiclyAccessible', true);
      if (options.json) logger.outputJson();
      return;
    }

    previousRequirements = extractRequirements(initialResponse);
    spinner.succeed('Initial requirements captured');

    if (previousRequirements) {
      logger.header('Initial State');
      logger.keyValue('Amount', previousRequirements.maxAmountRequired || previousRequirements.amount || 'N/A');
      logger.keyValue('Asset', previousRequirements.asset || 'N/A');
      logger.keyValue('Recipient', previousRequirements.payTo || previousRequirements.recipient || 'N/A');

      logger.setJsonData('initial', previousRequirements);
    }

    if (maxCount === 1) {
      if (options.json) logger.outputJson();
      return;
    }

    logger.log(`\nMonitoring for changes (every ${interval/1000}s, Ctrl+C to stop)...\n`);

    // Monitoring loop
    const checkForChanges = async () => {
      checkCount++;

      if (checkCount >= maxCount) {
        logger.header('Monitoring Complete');
        logger.keyValue('Total Checks', checkCount.toString());
        logger.keyValue('Changes Detected', changes.length.toString());
        logger.setJsonData('totalChecks', checkCount);
        logger.setJsonData('changes', changes);
        if (options.json) logger.outputJson();
        process.exit(0);
      }

      try {
        const response = await axios.get(url, {
          validateStatus: (status) => status === 402 || status === 200
        });

        if (response.status === 200) {
          if (previousRequirements !== null) {
            const change = {
              timestamp: new Date().toISOString(),
              type: 'became_public',
              check: checkCount
            };
            changes.push(change);

            logger.warn(`[${change.timestamp}] Endpoint became publicly accessible!`);
            previousRequirements = null;
          }
          return;
        }

        const currentRequirements = extractRequirements(response);

        if (!currentRequirements && previousRequirements) {
          const change = {
            timestamp: new Date().toISOString(),
            type: 'requirements_removed',
            check: checkCount
          };
          changes.push(change);
          logger.warn(`[${change.timestamp}] Payment requirements removed!`);
          previousRequirements = null;
          return;
        }

        if (currentRequirements && !previousRequirements) {
          const change = {
            timestamp: new Date().toISOString(),
            type: 'requirements_added',
            requirements: currentRequirements,
            check: checkCount
          };
          changes.push(change);
          logger.success(`[${change.timestamp}] Payment requirements added!`);
          previousRequirements = currentRequirements;
          return;
        }

        // Compare requirements
        const diffs = diffObjects(previousRequirements, currentRequirements);

        if (diffs.length > 0) {
          const change = {
            timestamp: new Date().toISOString(),
            type: 'requirements_changed',
            diffs,
            previous: previousRequirements,
            current: currentRequirements,
            check: checkCount
          };
          changes.push(change);

          logger.header(`Change Detected (Check #${checkCount})`);
          logger.keyValue('Time', change.timestamp);

          for (const diff of diffs) {
            if (diff.startsWith('+')) {
              logger.success(diff);
            } else if (diff.startsWith('-')) {
              logger.error(diff);
            } else {
              logger.warn(diff);
            }
          }

          previousRequirements = currentRequirements;
        }

      } catch (error: any) {
        logger.error(`Check #${checkCount} failed: ${error.message}`);
      }
    };

    // Run checks
    const intervalId = setInterval(checkForChanges, interval);

    // Handle shutdown
    process.on('SIGINT', () => {
      clearInterval(intervalId);
      logger.log('\n');
      logger.header('Monitoring Stopped');
      logger.keyValue('Total Checks', checkCount.toString());
      logger.keyValue('Changes Detected', changes.length.toString());
      logger.setJsonData('totalChecks', checkCount);
      logger.setJsonData('changes', changes);
      if (options.json) logger.outputJson();
      process.exit(0);
    });

  } catch (error: any) {
    spinner.fail('Diff failed');
    logger.error(error.message);
    logger.setJsonData('error', error.message);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
