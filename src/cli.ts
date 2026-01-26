#!/usr/bin/env node

import { Command } from 'commander';
import { testEndpoint } from './commands/test.js';
import { discoverEndpoints } from './commands/discover.js';
import { getEndpointInfo } from './commands/info.js';
import { verifyTransaction } from './commands/verify.js';

const program = new Command();

program
  .name('x402')
  .description('CLI tool for testing and interacting with x402 payment endpoints')
  .version('0.2.0');

program
  .command('test <url>')
  .description('Test an x402 endpoint by making a payment and receiving the resource')
  .option('-k, --key <privateKey>', 'Private key for signing payments (or set X402_PRIVATE_KEY env var)')
  .option('-a, --amount <amount>', 'Override payment amount')
  .option('-n, --network <network>', 'Network for payments (e.g., base-sepolia, base)', 'base-sepolia')
  .option('-v, --verbose', 'Show detailed payment flow')
  .action(testEndpoint);

program
  .command('discover')
  .description('Discover available x402 endpoints in the network')
  .option('-f, --filter <type>', 'Filter by resource type')
  .option('-l, --limit <number>', 'Limit number of results', '20')
  .action(discoverEndpoints);

program
  .command('info <url>')
  .description('Get payment requirements for an endpoint without paying')
  .option('-v, --verbose', 'Show full payment requirements JSON')
  .action(getEndpointInfo);

program
  .command('verify <txHash>')
  .description('Verify a transaction hash corresponds to an x402 payment')
  .option('-n, --network <network>', 'Network to check (e.g., base-sepolia)', 'base-sepolia')
  .action(verifyTransaction);

program.parse();
