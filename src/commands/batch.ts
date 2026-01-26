import { readFileSync, existsSync } from 'fs';
import axios from 'axios';
import { logger } from '../utils/logger.js';
import ora from 'ora';

interface BatchOptions {
  json?: boolean;
  timeout?: string;
}

interface BatchResult {
  url: string;
  status: number | null;
  paymentRequired: boolean;
  price?: string;
  asset?: string;
  network?: string;
  error?: string;
}

export async function batchCommand(file: string, options: BatchOptions) {
  if (!existsSync(file)) {
    logger.error(`File not found: ${file}`);
    process.exit(1);
  }

  const content = readFileSync(file, 'utf-8');
  const urls = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));

  if (urls.length === 0) {
    logger.error('No URLs found in file');
    process.exit(1);
  }

  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('Batch Testing x402 Endpoints');
  logger.info(`File: ${file}`);
  logger.info(`Endpoints: ${urls.length}`);

  const timeout = parseInt(options.timeout || '10') * 1000;
  const results: BatchResult[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const spinner = ora(`[${i + 1}/${urls.length}] ${url}`).start();

    const result: BatchResult = {
      url,
      status: null,
      paymentRequired: false
    };

    try {
      const response = await axios.get(url, {
        validateStatus: () => true,
        timeout
      });

      result.status = response.status;
      result.paymentRequired = response.status === 402;

      if (response.status === 402) {
        // Extract payment info
        const paymentHeader = response.headers['x-payment-required'];
        if (paymentHeader) {
          try {
            const requirements = JSON.parse(paymentHeader);
            const accepts = requirements.accepts || requirements.paymentRequirements || [];
            if (accepts[0]) {
              result.price = accepts[0].maxAmountRequired || accepts[0].amount;
              result.asset = accepts[0].asset;
              result.network = accepts[0].network;
            }
          } catch {}
        } else if (response.data?.accepts?.[0]) {
          const accepts = response.data.accepts[0];
          result.price = accepts.maxAmountRequired || accepts.amount;
          result.asset = accepts.asset;
          result.network = accepts.network;
        }

        spinner.succeed(`[${i + 1}/${urls.length}] ${url} - 402 (${result.price || 'unknown'} ${result.asset || ''})`);
      } else if (response.status === 200) {
        spinner.succeed(`[${i + 1}/${urls.length}] ${url} - FREE`);
      } else {
        spinner.warn(`[${i + 1}/${urls.length}] ${url} - ${response.status}`);
      }

    } catch (error: any) {
      result.error = error.message;
      spinner.fail(`[${i + 1}/${urls.length}] ${url} - ERROR: ${error.message}`);
    }

    results.push(result);
  }

  // Summary
  const paid = results.filter(r => r.paymentRequired).length;
  const free = results.filter(r => r.status === 200).length;
  const errors = results.filter(r => r.error).length;

  if (options.json) {
    logger.setJsonData('results', results);
    logger.setJsonData('summary', { total: urls.length, paid, free, errors });
    logger.outputJson();
  } else {
    logger.header('Summary');
    logger.keyValue('Total', urls.length.toString());
    logger.keyValue('Payment Required', paid.toString());
    logger.keyValue('Free', free.toString());
    logger.keyValue('Errors', errors.toString());
  }
}
