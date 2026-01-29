import axios from 'axios';
import { logger } from '../utils/logger.js';
import ora from 'ora';

interface CurlOptions {
  method?: string;
  headers?: string[];
  data?: string;
  json?: boolean;
}

export async function curlCommand(url: string, options: CurlOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('Generate curl Command');
  logger.info(`Target: ${url}`);

  const spinner = ora();

  try {
    // First, fetch the payment requirements
    spinner.start('Fetching payment requirements');

    const response = await axios.get(url, {
      validateStatus: (status) => status === 402 || status === 200
    });

    if (response.status === 200) {
      spinner.succeed('Endpoint is publicly accessible');

      const curlCmd = `curl '${url}'`;
      logger.header('curl Command');
      logger.log(`\n${curlCmd}\n`);

      logger.setJsonData('curl', curlCmd);
      logger.setJsonData('paymentRequired', false);

      if (options.json) logger.outputJson();
      return;
    }

    spinner.succeed('Payment requirements retrieved');

    // Parse requirements
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

    const accepts = paymentData.accepts || paymentData.paymentRequirements || [];

    if (!accepts[0]) {
      logger.error('Could not parse payment requirements');
      if (options.json) logger.outputJson();
      process.exit(1);
    }

    const req = accepts[0];

    logger.header('Payment Details');
    logger.keyValue('Amount', req.maxAmountRequired || req.amount || 'N/A');
    logger.keyValue('Asset', req.asset || 'USDC');
    logger.keyValue('Recipient', req.payTo || req.recipient || 'N/A');
    logger.keyValue('Network', req.network || 'N/A');

    logger.setJsonData('paymentRequired', true);
    logger.setJsonData('paymentDetails', req);

    // Generate the X-Payment header structure
    // Note: This is a template - the actual signature would need to be generated
    const paymentHeaderTemplate = {
      "x402Version": 1,
      "scheme": req.scheme || "exact",
      "network": req.network,
      "payload": {
        "signature": "<EIP-3009_SIGNATURE>",
        "authorization": {
          "from": "<YOUR_WALLET_ADDRESS>",
          "to": req.payTo || req.recipient,
          "value": req.maxAmountRequired || req.amount,
          "validAfter": "0",
          "validBefore": "<TIMESTAMP>",
          "nonce": "<RANDOM_NONCE>"
        }
      }
    };

    // Build curl command
    const method = options.method?.toUpperCase() || 'GET';
    let curlParts = [`curl -X ${method}`];

    // Add payment header placeholder
    curlParts.push(`  -H 'X-Payment: <SIGNED_PAYMENT_JSON>'`);

    // Add content type for x402
    curlParts.push(`  -H 'Content-Type: application/json'`);

    // Add any additional headers
    if (options.headers) {
      for (const header of options.headers) {
        curlParts.push(`  -H '${header}'`);
      }
    }

    // Add data if provided
    if (options.data) {
      curlParts.push(`  -d '${options.data}'`);
    }

    // Add URL
    curlParts.push(`  '${url}'`);

    const curlCmd = curlParts.join(' \\\n');

    logger.header('curl Command Template');
    logger.log(`\n${curlCmd}\n`);

    logger.header('X-Payment Header Structure');
    logger.log('\nThe X-Payment header should contain a signed payment object:');
    logger.json(paymentHeaderTemplate);

    logger.header('Instructions');
    logger.log(`
1. Generate an EIP-3009 authorization signature using your wallet
2. Replace <YOUR_WALLET_ADDRESS> with your wallet address
3. Replace <TIMESTAMP> with Unix timestamp (validBefore)
4. Replace <RANDOM_NONCE> with a random bytes32 value
5. Replace <EIP-3009_SIGNATURE> with the signature
6. Replace <SIGNED_PAYMENT_JSON> with the complete JSON-encoded payment

Or use x402-cli to handle this automatically:
  x402 test ${url}
`);

    // Also generate a simpler version for testing without payment
    logger.header('Test Without Payment');
    logger.log(`
To see the 402 response:
  curl -v '${url}'

To see payment requirements:
  curl -s '${url}' | jq
`);

    logger.setJsonData('curl', curlCmd);
    logger.setJsonData('paymentHeaderTemplate', paymentHeaderTemplate);

    if (options.json) logger.outputJson();

  } catch (error: any) {
    spinner.fail('Failed to generate curl command');
    logger.error(error.message);
    logger.setJsonData('error', error.message);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
