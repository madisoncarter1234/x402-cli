import { logger } from '../utils/logger.js';
import ora from 'ora';
import http from 'http';
import { URL } from 'url';

interface MockOptions {
  port?: string;
  price?: string;
  asset?: string;
  recipient?: string;
  json?: boolean;
}

export async function mockCommand(options: MockOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('x402 Mock Server');

  const port = parseInt(options.port || '3402');
  const price = options.price || '100';  // 100 = $0.0001 USDC
  const asset = options.asset || 'USDC';
  const recipient = options.recipient || '0x0000000000000000000000000000000000000001';

  logger.info(`Port: ${port}`);
  logger.info(`Price: ${price} (raw units)`);
  logger.info(`Asset: ${asset}`);
  logger.info(`Recipient: ${recipient}`);

  const paymentRequirements = {
    x402Version: 1,
    accepts: [{
      scheme: 'exact',
      network: 'eip155:84532',
      maxAmountRequired: price,
      resource: `http://localhost:${port}/resource`,
      description: 'Mock x402 resource',
      mimeType: 'application/json',
      payTo: recipient,
      maxTimeoutSeconds: 60,
      asset: `eip155:84532/erc20:0x036CbD53842c5426634e7929541eC2318f3dCF7e`,
      extra: {
        name: asset,
        decimals: 6
      }
    }],
    error: null
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const path = url.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'X-Payment, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'X-Payment-Required, X-Payment-Response');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Log request
    const timestamp = new Date().toISOString();
    logger.log(`[${timestamp}] ${req.method} ${path}`);

    // Health check endpoint
    if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', x402: true }));
      return;
    }

    // Info endpoint (always returns payment requirements)
    if (path === '/info') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(paymentRequirements));
      return;
    }

    // Check for payment header
    const paymentHeader = req.headers['x-payment'];

    if (!paymentHeader) {
      // Return 402 with payment requirements
      logger.info('  → 402 Payment Required');

      res.writeHead(402, {
        'Content-Type': 'application/json',
        'X-Payment-Required': JSON.stringify(paymentRequirements)
      });
      res.end(JSON.stringify(paymentRequirements));
      return;
    }

    // Simulate payment verification
    logger.info('  → Payment header received, verifying...');

    try {
      const payment = JSON.parse(paymentHeader as string);

      // Simple validation - in real x402, this would verify the signature
      if (!payment.payload || !payment.signature) {
        throw new Error('Invalid payment format');
      }

      // Simulate successful payment
      const mockTxHash = '0x' + Array(64).fill(0).map(() =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('');

      logger.success('  → Payment accepted');

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'X-Payment-Response': JSON.stringify({
          success: true,
          txHash: mockTxHash,
          network: 'eip155:84532',
          amount: price,
          asset: asset
        })
      });

      res.end(JSON.stringify({
        message: 'Payment successful!',
        data: {
          resource: path,
          accessGranted: true,
          timestamp: new Date().toISOString(),
          mockData: {
            example: 'This is your paid content',
            randomValue: Math.random()
          }
        }
      }));

    } catch (error: any) {
      logger.error(`  → Payment verification failed: ${error.message}`);

      res.writeHead(402, {
        'Content-Type': 'application/json',
        'X-Payment-Required': JSON.stringify(paymentRequirements)
      });
      res.end(JSON.stringify({
        ...paymentRequirements,
        error: 'Payment verification failed',
        message: error.message
      }));
    }
  });

  server.listen(port, () => {
    logger.header('Server Running');
    logger.log(`\nMock x402 server listening on http://localhost:${port}\n`);

    logger.log('Endpoints:');
    logger.log(`  GET http://localhost:${port}/resource  - Protected resource (402)`);
    logger.log(`  GET http://localhost:${port}/info      - Payment requirements`);
    logger.log(`  GET http://localhost:${port}/health    - Health check\n`);

    logger.log('Test commands:');
    logger.log(`  x402 info http://localhost:${port}/resource`);
    logger.log(`  x402 test http://localhost:${port}/resource --dry-run`);
    logger.log(`  x402 test http://localhost:${port}/resource\n`);

    logger.info('Press Ctrl+C to stop the server\n');

    logger.setJsonData('server', {
      port,
      url: `http://localhost:${port}`,
      endpoints: ['/resource', '/info', '/health'],
      paymentRequirements
    });

    if (options.json) {
      logger.outputJson();
    }
  });

  // Handle shutdown
  process.on('SIGINT', () => {
    logger.log('\nShutting down mock server...');
    server.close(() => {
      logger.success('Server stopped');
      process.exit(0);
    });
  });
}
