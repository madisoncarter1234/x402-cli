import http from 'http';
import { URL } from 'url';
import { logger } from '../utils/logger.js';
import { getPrivateKey, getNetwork, NETWORK_CHAIN_IDS } from '../utils/config.js';
import ora from 'ora';
import axios from 'axios';
import { privateKeyToAccount } from 'viem/accounts';
import { x402Client } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm';
import { wrapAxiosWithPayment } from '@x402/axios';

interface ProxyOptions {
  port?: string;
  key?: string;
  network?: string;
  allowlist?: string;
  json?: boolean;
}

export async function proxyCommand(options: ProxyOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('x402 Payment Proxy');

  const port = parseInt(options.port || '3401');

  const spinner = ora();

  try {
    const privateKey = getPrivateKey(options.key);
    if (!privateKey) {
      logger.error('Private key required for proxy. Use --key flag or set X402_PRIVATE_KEY env var');
      if (options.json) logger.outputJson();
      process.exit(1);
    }

    const formattedKey = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
    const account = privateKeyToAccount(formattedKey);
    const networkName = getNetwork(options.network);
    const chainId = NETWORK_CHAIN_IDS[networkName.toLowerCase()];

    logger.info(`Wallet: ${account.address}`);
    logger.info(`Network: ${networkName} (chain ${chainId})`);
    logger.info(`Port: ${port}`);

    // Set up x402 client with axios wrapper
    spinner.start('Initializing x402 client');

    const network = `eip155:${chainId}` as const;
    const evmScheme = new ExactEvmScheme(account);

    const x402 = new x402Client()
      .register(network, evmScheme)
      .register('eip155:*', evmScheme);

    const paymentAxios = wrapAxiosWithPayment(axios.create(), x402);

    spinner.succeed('x402 client ready');

    // Parse allowlist
    const allowedHosts = options.allowlist
      ? options.allowlist.split(',').map(h => h.trim().toLowerCase())
      : null;

    if (allowedHosts) {
      logger.info(`Allowlist: ${allowedHosts.join(', ')}`);
    }

    // Track payments
    let totalPayments = 0;
    let totalRequests = 0;

    const server = http.createServer(async (req, res) => {
      totalRequests++;

      const targetUrl = req.url?.startsWith('/')
        ? req.headers['x-target-url'] as string
        : req.url;

      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing target URL. Use X-Target-URL header or full URL.' }));
        return;
      }

      const timestamp = new Date().toISOString();
      logger.log(`[${timestamp}] ${req.method} ${targetUrl}`);

      try {
        const url = new URL(targetUrl);

        // Check allowlist
        if (allowedHosts && !allowedHosts.includes(url.hostname.toLowerCase())) {
          logger.warn(`  → Blocked: ${url.hostname} not in allowlist`);
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Host not in allowlist' }));
          return;
        }

        // Collect request body if present
        let body = '';
        req.on('data', chunk => body += chunk);

        await new Promise<void>(resolve => req.on('end', resolve));

        // Forward request using payment-enabled axios
        const method = (req.method || 'GET').toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch';

        const axiosConfig: any = {
          method,
          url: targetUrl,
          headers: {
            ...req.headers,
            host: url.host
          },
          validateStatus: () => true // Don't throw on any status
        };

        // Remove proxy-specific headers
        delete axiosConfig.headers['x-target-url'];
        delete axiosConfig.headers['connection'];
        delete axiosConfig.headers['transfer-encoding'];

        if (body && ['post', 'put', 'patch'].includes(method)) {
          axiosConfig.data = body;
        }

        const response = await paymentAxios.request(axiosConfig);

        logger.info(`  → Response: ${response.status}`);

        // Check if a payment was made (look for x-payment-response header)
        if (response.headers['x-payment-response']) {
          totalPayments++;
          logger.success(`  → Payment made (total: ${totalPayments})`);
        }

        // Forward response headers
        const responseHeaders: Record<string, string> = {
          'X-Proxy-Payment': 'true',
          'X-Proxy-Payment-Count': totalPayments.toString()
        };

        for (const [key, value] of Object.entries(response.headers)) {
          if (value && typeof value === 'string') {
            responseHeaders[key] = value;
          }
        }

        res.writeHead(response.status, responseHeaders);

        if (typeof response.data === 'object') {
          res.end(JSON.stringify(response.data));
        } else {
          res.end(response.data);
        }

      } catch (e: any) {
        logger.error(`  → Error: ${e.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });

    server.listen(port, () => {
      logger.header('Proxy Running');
      logger.log(`\nx402 payment proxy listening on http://localhost:${port}\n`);

      logger.log('Usage:');
      logger.log(`  curl -H "X-Target-URL: https://api.example.com/resource" http://localhost:${port}/`);
      logger.log(`  curl http://localhost:${port}/https://api.example.com/resource\n`);

      logger.log('The proxy will:');
      logger.log('  1. Forward your request to the target URL');
      logger.log('  2. If 402 is returned, automatically create and send payment');
      logger.log('  3. Return the paid response to you\n');

      logger.info('Press Ctrl+C to stop the proxy\n');

      logger.setJsonData('proxy', {
        port,
        wallet: account.address,
        network: networkName,
        allowlist: allowedHosts
      });

      if (options.json) logger.outputJson();
    });

    // Handle shutdown
    process.on('SIGINT', () => {
      logger.log('\n');
      logger.header('Proxy Statistics');
      logger.keyValue('Total Requests', totalRequests.toString());
      logger.keyValue('Total Payments', totalPayments.toString());
      logger.log('\nShutting down proxy...');
      server.close(() => {
        logger.success('Proxy stopped');
        process.exit(0);
      });
    });

  } catch (error: any) {
    spinner.fail('Proxy startup failed');
    logger.error(error.message);
    logger.setJsonData('error', error.message);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
