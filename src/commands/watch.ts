import axios from 'axios';
import { logger } from '../utils/logger.js';
import ora from 'ora';

interface WatchOptions {
  interval?: string;
  count?: string;
  json?: boolean;
}

export async function watchCommand(url: string, options: WatchOptions) {
  const interval = parseInt(options.interval || '10') * 1000; // Default 10 seconds
  const maxCount = options.count ? parseInt(options.count) : Infinity;

  logger.header('Watching x402 Endpoint');
  logger.info(`URL: ${url}`);
  logger.info(`Interval: ${interval / 1000}s`);
  if (maxCount !== Infinity) {
    logger.info(`Max checks: ${maxCount}`);
  }
  logger.log('\nPress Ctrl+C to stop\n');

  let count = 0;
  let lastStatus: number | null = null;
  let lastPrice: string | null = null;

  const check = async () => {
    count++;
    const timestamp = new Date().toISOString();
    const spinner = ora(`Check #${count}`).start();

    try {
      const response = await axios.get(url, {
        validateStatus: (status) => status === 402 || status === 200,
        timeout: 10000
      });

      const status = response.status;
      let price: string | null = null;
      let changed = false;

      if (status === 402) {
        // Extract price from v2 header or v1 body
        const paymentHeader = response.headers['x-payment-required'];
        if (paymentHeader) {
          try {
            const requirements = JSON.parse(paymentHeader);
            const accepts = requirements.accepts || requirements.paymentRequirements || [];
            if (accepts[0]) {
              price = accepts[0].maxAmountRequired || accepts[0].amount || 'unknown';
            }
          } catch {}
        } else if (response.data?.accepts?.[0]) {
          price = response.data.accepts[0].maxAmountRequired || response.data.accepts[0].amount || 'unknown';
        }
      }

      // Check for changes
      if (lastStatus !== null && (status !== lastStatus || price !== lastPrice)) {
        changed = true;
      }

      lastStatus = status;
      lastPrice = price;

      if (options.json) {
        const entry = {
          timestamp,
          check: count,
          status,
          price,
          changed
        };
        console.log(JSON.stringify(entry));
      } else {
        const statusText = status === 200 ? 'FREE' : `402 (${price || 'unknown'})`;
        const changeIndicator = changed ? ' [CHANGED]' : '';
        spinner.succeed(`#${count} [${timestamp}] ${statusText}${changeIndicator}`);
      }

    } catch (error: any) {
      if (options.json) {
        console.log(JSON.stringify({
          timestamp,
          check: count,
          error: error.message
        }));
      } else {
        spinner.fail(`#${count} [${timestamp}] Error: ${error.message}`);
      }
    }

    if (count < maxCount) {
      setTimeout(check, interval);
    } else {
      logger.log('\nWatch complete');
    }
  };

  // Start watching
  check();
}
