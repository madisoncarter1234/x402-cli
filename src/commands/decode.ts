import axios from 'axios';
import { logger } from '../utils/logger.js';
import ora from 'ora';
import chalk from 'chalk';
import { NETWORK_CHAIN_IDS, USDC_ADDRESSES } from '../utils/config.js';

interface DecodeOptions {
  url?: boolean;
  json?: boolean;
}

function tryParseBase64(input: string): any | null {
  try {
    const decoded = Buffer.from(input, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function tryParseJson(input: string): any | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function annotatePaymentField(key: string, value: any): string | null {
  const strVal = String(value);

  if (key === 'asset' || key === 'resource') {
    // Look up known USDC addresses
    const normalized = strVal.toLowerCase();
    for (const [network, addr] of Object.entries(USDC_ADDRESSES)) {
      if (addr.toLowerCase() === normalized) {
        return `USDC on ${network}`;
      }
    }
  }

  if (key === 'scheme' && strVal.includes(':')) {
    const [scheme, network] = strVal.split(':');
    return `${scheme} scheme on ${network}`;
  }

  if (key === 'chainId' || key === 'network') {
    const numVal = parseInt(strVal);
    if (!isNaN(numVal)) {
      for (const [name, id] of Object.entries(NETWORK_CHAIN_IDS)) {
        if (id === numVal) return `${name} (chain ${id})`;
      }
    }
  }

  if (key === 'maxAmountRequired' || key === 'amount' || key === 'price') {
    const num = parseFloat(strVal);
    if (!isNaN(num) && num > 0) {
      // Guess if this is raw units (large number) vs formatted
      if (num > 1000000) {
        const usdc = num / 1e6;
        return `${usdc.toFixed(6)} USDC (assuming 6 decimals)`;
      }
    }
  }

  if (key === 'maxTimeoutSeconds' || key === 'timeout') {
    const secs = parseInt(strVal);
    if (!isNaN(secs)) {
      if (secs >= 3600) return `${(secs / 3600).toFixed(1)} hours`;
      if (secs >= 60) return `${(secs / 60).toFixed(1)} minutes`;
      return `${secs} seconds`;
    }
  }

  return null;
}

function printAnnotated(obj: any, indent: number = 0) {
  const prefix = '  '.repeat(indent);

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      logger.log(`${prefix}[${i}]:`);
      printAnnotated(item, indent + 1);
    });
    return;
  }

  if (typeof obj === 'object' && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        logger.log(`${prefix}${chalk.bold(key)}:`);
        printAnnotated(value, indent + 1);
      } else {
        const annotation = annotatePaymentField(key, value);
        if (annotation) {
          logger.log(`${prefix}${chalk.bold(key)}: ${value} ${chalk.dim(`← ${annotation}`)}`);
        } else {
          logger.log(`${prefix}${chalk.bold(key)}: ${value}`);
        }
      }
    }
    return;
  }

  logger.log(`${prefix}${obj}`);
}

export async function decodeCommand(input: string, options: DecodeOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('x402 Decode');

  let paymentData: any = null;
  let source: string;

  // If --url flag or input looks like a URL, fetch from endpoint
  if (options.url || input.startsWith('http://') || input.startsWith('https://')) {
    source = 'url';
    logger.info(`Fetching from: ${input}`);

    const spinner = ora('Fetching payment requirements').start();

    try {
      const response = await axios.get(input, {
        validateStatus: (status) => status === 402 || status === 200,
        timeout: 10000
      });

      if (response.status === 200) {
        spinner.warn('Endpoint returned 200 (no payment required)');
        logger.setJsonData('decoded', null);
        logger.setJsonData('source', 'url');
        logger.setJsonData('note', 'Endpoint is publicly accessible');
        if (options.json) logger.outputJson();
        return;
      }

      spinner.succeed('Got 402 response');

      // Try v2 header first
      const headerPayload = response.headers['x-payment-required'];
      if (headerPayload) {
        paymentData = tryParseJson(headerPayload);
        if (paymentData) {
          logger.info('Source: x-payment-required header (v2)');
        }
      }

      // Fall back to body
      if (!paymentData) {
        paymentData = response.data;
        logger.info('Source: response body (v1)');
      }
    } catch (error: any) {
      spinner.fail('Request failed');
      logger.error(error.message);
      if (options.json) logger.outputJson();
      process.exit(1);
    }
  } else {
    // Try to parse as base64 first, then as JSON
    source = 'input';

    paymentData = tryParseBase64(input);
    if (paymentData) {
      logger.info('Decoded from base64');
      source = 'base64';
    } else {
      paymentData = tryParseJson(input);
      if (paymentData) {
        logger.info('Parsed as JSON');
        source = 'json';
      }
    }

    if (!paymentData) {
      logger.error('Could not parse input as base64 or JSON');
      logger.log('\nExpected formats:');
      logger.log('  - Base64-encoded JSON (x-payment header value)');
      logger.log('  - Raw JSON string');
      logger.log('  - URL to an x402 endpoint (auto-detected)');
      if (options.json) logger.outputJson();
      process.exit(1);
    }
  }

  logger.setJsonData('source', source);
  logger.setJsonData('decoded', paymentData);

  // Pretty-print with annotations
  logger.header('Decoded Payment Data');
  logger.log('');
  printAnnotated(paymentData);

  // Summarize payment options
  const accepts = paymentData.accepts || paymentData.paymentRequirements || [];
  if (accepts.length > 0) {
    logger.header('Payment Options Summary');

    for (let i = 0; i < accepts.length; i++) {
      const req = accepts[i];
      const amount = req.maxAmountRequired || req.amount || req.price || '?';
      const asset = req.asset || '?';
      const payTo = req.payTo || req.recipient || '?';

      let network = req.network || '';
      if (req.scheme && req.scheme.includes(':')) {
        network = req.scheme.split(':')[1];
      }

      logger.log('');
      logger.keyValue(`Option ${i + 1}`, `${amount} ${asset} on ${network || 'unknown'}`);
      logger.keyValue('  Pay to', payTo);

      if (req.description) {
        logger.keyValue('  Description', req.description);
      }
      if (req.facilitator) {
        logger.keyValue('  Facilitator', req.facilitator);
      }
    }
  }

  // If it has a raw x-payment header embedded, try to decode it too
  if (paymentData.payment || paymentData['x-payment']) {
    const paymentHeader = paymentData.payment || paymentData['x-payment'];
    const innerData = tryParseBase64(paymentHeader) || tryParseJson(paymentHeader);

    if (innerData) {
      logger.header('Embedded Payment Payload');
      printAnnotated(innerData);
      logger.setJsonData('embeddedPayment', innerData);
    }
  }

  if (options.json) logger.outputJson();
}
