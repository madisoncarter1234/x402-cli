import axios from 'axios';
import { logger } from '../utils/logger.js';
import ora from 'ora';

interface InfoOptions {
  verbose?: boolean;
}

export async function getEndpointInfo(url: string, options: InfoOptions) {
  logger.header('x402 Endpoint Information');
  logger.info(`URL: ${url}`);

  const spinner = ora('Fetching payment requirements').start();

  try {
    const response = await axios.get(url, {
      validateStatus: (status) => status === 402 || status === 200
    });

    if (response.status === 200) {
      spinner.succeed('Endpoint is publicly accessible (no payment required)');
      logger.success('This endpoint does not require payment');
      return;
    }

    if (response.status !== 402) {
      spinner.warn(`Unexpected status: ${response.status}`);
      logger.warn('This endpoint may not be an x402 endpoint');
      return;
    }

    spinner.succeed('Payment requirements retrieved');

    // v2 uses headers, v1 uses body
    const paymentRequiredHeader = response.headers['x-payment-required'];
    let paymentData: any;

    if (paymentRequiredHeader) {
      // v2 format - payment requirements in header
      try {
        paymentData = JSON.parse(paymentRequiredHeader);
        logger.info('x402 Version: 2 (header-based)');
      } catch {
        logger.warn('Could not parse payment header');
        paymentData = response.data;
      }
    } else {
      // v1 format - payment requirements in body
      paymentData = response.data;
      logger.info('x402 Version: 1 (body-based)');
    }

    if (options.verbose) {
      logger.header('Full Payment Requirements');
      logger.json(paymentData);
      return;
    }

    logger.header('Payment Requirements');

    if (paymentData.x402Version) {
      logger.keyValue('Protocol Version', paymentData.x402Version.toString());
    }

    if (paymentData.error) {
      logger.error(`Server Error: ${paymentData.error}`);
    }

    const accepts = paymentData.accepts || paymentData.paymentRequirements || [];

    if (!accepts || accepts.length === 0) {
      logger.warn('No payment options available');
      return;
    }

    logger.log(`\nAccepts ${accepts.length} payment option(s):\n`);

    accepts.forEach((requirement: any, index: number) => {
      console.log(logger.step(`Option ${index + 1}`));

      // v2 uses scheme:network format, v1 has separate fields
      if (requirement.scheme && requirement.scheme.includes(':')) {
        const [scheme, network] = requirement.scheme.split(':');
        logger.keyValue('  Scheme', scheme);
        logger.keyValue('  Network', network);
      } else {
        logger.keyValue('  Network', requirement.network);
        logger.keyValue('  Scheme', requirement.scheme);
      }

      // Amount field names vary between versions
      const amount = requirement.maxAmountRequired || requirement.amount || requirement.price;
      logger.keyValue('  Amount', amount);
      logger.keyValue('  Asset', requirement.asset);
      logger.keyValue('  Pay To', requirement.payTo || requirement.recipient);

      if (requirement.description) {
        logger.keyValue('  Description', requirement.description);
      }

      if (requirement.mimeType || requirement.resource?.mimeType) {
        logger.keyValue('  Response Type', requirement.mimeType || requirement.resource?.mimeType);
      }

      if (requirement.maxTimeoutSeconds || requirement.timeout) {
        logger.keyValue('  Max Timeout', `${requirement.maxTimeoutSeconds || requirement.timeout}s`);
      }

      // v2 may include facilitator info
      if (requirement.facilitator) {
        logger.keyValue('  Facilitator', requirement.facilitator);
      }

      console.log();
    });

    logger.info('Use --verbose flag to see full JSON');

  } catch (error: any) {
    spinner.fail('Request failed');
    logger.error(error.message);

    if (error.code === 'ENOTFOUND') {
      logger.warn('Could not resolve hostname. Check the URL.');
    } else if (error.code === 'ECONNREFUSED') {
      logger.warn('Connection refused. Is the server running?');
    }

    if (options.verbose && error.response) {
      logger.json(error.response.data);
    }

    process.exit(1);
  }
}
