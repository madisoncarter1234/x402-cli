import axios from 'axios';
import { logger } from '../utils/logger.js';
import ora from 'ora';
import chalk from 'chalk';

interface CompareOptions {
  timeout?: string;
  json?: boolean;
}

interface EndpointResult {
  url: string;
  status: number;
  latencyMs: number;
  version: string | null;
  options: PaymentOption[];
  error: string | null;
}

interface PaymentOption {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  description?: string;
  maxTimeout?: string;
  facilitator?: string;
}

function parsePaymentData(response: any): { version: string; options: PaymentOption[] } {
  const paymentRequiredHeader = response.headers['x-payment-required'];
  let paymentData: any;
  let version = 'v1';

  if (paymentRequiredHeader) {
    try {
      paymentData = JSON.parse(paymentRequiredHeader);
      version = 'v2';
    } catch {
      paymentData = response.data;
    }
  } else {
    paymentData = response.data;
  }

  const accepts = paymentData.accepts || paymentData.paymentRequirements || [];

  const options: PaymentOption[] = accepts.map((req: any) => {
    let scheme = req.scheme || '';
    let network = req.network || '';

    if (scheme.includes(':')) {
      const parts = scheme.split(':');
      scheme = parts[0];
      network = parts[1];
    }

    return {
      scheme,
      network,
      amount: req.maxAmountRequired || req.amount || req.price || 'unknown',
      asset: req.asset || 'unknown',
      payTo: req.payTo || req.recipient || 'unknown',
      description: req.description,
      maxTimeout: req.maxTimeoutSeconds || req.timeout,
      facilitator: req.facilitator
    };
  });

  return { version, options };
}

async function fetchEndpoint(url: string, timeoutMs: number): Promise<EndpointResult> {
  const start = Date.now();

  try {
    const response = await axios.get(url, {
      validateStatus: (status) => status === 402 || status === 200,
      timeout: timeoutMs
    });

    const latencyMs = Date.now() - start;

    if (response.status === 200) {
      return {
        url,
        status: 200,
        latencyMs,
        version: null,
        options: [],
        error: 'No payment required (public endpoint)'
      };
    }

    const { version, options } = parsePaymentData(response);

    return {
      url,
      status: 402,
      latencyMs,
      version,
      options,
      error: null
    };
  } catch (error: any) {
    return {
      url,
      status: 0,
      latencyMs: Date.now() - start,
      version: null,
      options: [],
      error: error.message
    };
  }
}

export async function compareCommand(urls: string[], options: CompareOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  if (urls.length < 2) {
    logger.error('At least 2 URLs are required for comparison');
    logger.log('\nUsage: x402 compare <url1> <url2> [url3...]');
    if (options.json) logger.outputJson();
    process.exit(1);
  }

  logger.header('x402 Endpoint Comparison');
  logger.info(`Comparing ${urls.length} endpoints`);

  const timeoutMs = parseInt(options.timeout || '10') * 1000;
  const spinner = ora(`Fetching payment requirements from ${urls.length} endpoints`).start();

  const results = await Promise.all(urls.map(url => fetchEndpoint(url, timeoutMs)));

  spinner.succeed('All endpoints queried');
  logger.setJsonData('endpoints', results);

  // Summary table
  logger.header('Comparison');

  // Column width based on longest URL
  const maxUrlLen = Math.min(Math.max(...results.map(r => r.url.length), 10), 50);

  // Header row
  const pad = (s: string, len: number) => s.length > len ? s.substring(0, len - 1) + '…' : s.padEnd(len);
  const divider = '-'.repeat(maxUrlLen + 60);

  logger.log('');
  logger.log(
    chalk.bold(pad('Endpoint', maxUrlLen)) + '  ' +
    chalk.bold(pad('Price', 14)) + '  ' +
    chalk.bold(pad('Network', 16)) + '  ' +
    chalk.bold(pad('Latency', 10)) + '  ' +
    chalk.bold(pad('Ver', 4))
  );
  logger.log(divider);

  for (const result of results) {
    if (result.error) {
      logger.log(
        chalk.red(pad(result.url, maxUrlLen)) + '  ' +
        chalk.red(pad(result.error.substring(0, 14), 14)) + '  ' +
        pad('-', 16) + '  ' +
        pad(`${result.latencyMs}ms`, 10) + '  ' +
        pad('-', 4)
      );
      continue;
    }

    const cheapest = result.options[0];
    if (!cheapest) {
      logger.log(
        pad(result.url, maxUrlLen) + '  ' +
        pad('no options', 14) + '  ' +
        pad('-', 16) + '  ' +
        pad(`${result.latencyMs}ms`, 10) + '  ' +
        pad(result.version || '-', 4)
      );
      continue;
    }

    const priceStr = `${cheapest.amount} ${cheapest.asset}`;
    const latencyColor = result.latencyMs < 500 ? chalk.green : result.latencyMs < 2000 ? chalk.yellow : chalk.red;

    logger.log(
      pad(result.url, maxUrlLen) + '  ' +
      chalk.cyan(pad(priceStr, 14)) + '  ' +
      pad(cheapest.network, 16) + '  ' +
      latencyColor(pad(`${result.latencyMs}ms`, 10)) + '  ' +
      pad(result.version || '-', 4)
    );

    // Show additional payment options if more than one
    for (const opt of result.options.slice(1)) {
      const altPrice = `${opt.amount} ${opt.asset}`;
      logger.log(
        pad('', maxUrlLen) + '  ' +
        chalk.dim(pad(altPrice, 14)) + '  ' +
        chalk.dim(pad(opt.network, 16)) + '  ' +
        pad('', 10) + '  ' +
        pad('', 4)
      );
    }
  }

  logger.log('');

  // Find cheapest (try to parse amounts as numbers for comparison)
  const priced = results
    .filter(r => !r.error && r.options.length > 0)
    .map(r => ({
      url: r.url,
      amount: parseFloat(r.options[0].amount) || Infinity,
      asset: r.options[0].asset,
      latencyMs: r.latencyMs
    }));

  if (priced.length >= 2) {
    logger.header('Analysis');

    const cheapest = priced.reduce((a, b) => a.amount < b.amount ? a : b);
    const fastest = priced.reduce((a, b) => a.latencyMs < b.latencyMs ? a : b);

    logger.keyValue('Cheapest', `${cheapest.url} (${cheapest.amount} ${cheapest.asset})`);
    logger.keyValue('Fastest response', `${fastest.url} (${fastest.latencyMs}ms)`);

    logger.setJsonData('analysis', {
      cheapest: { url: cheapest.url, amount: cheapest.amount, asset: cheapest.asset },
      fastest: { url: fastest.url, latencyMs: fastest.latencyMs }
    });
  }

  if (options.json) logger.outputJson();
}
