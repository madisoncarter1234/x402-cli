#!/usr/bin/env node

import { Command } from 'commander';
import { testEndpoint } from './commands/test.js';
import { discoverEndpoints } from './commands/discover.js';
import { getEndpointInfo } from './commands/info.js';
import { verifyTransaction } from './commands/verify.js';
import { balanceCommand } from './commands/balance.js';
import { configCommand } from './commands/config.js';
import { watchCommand } from './commands/watch.js';
import { batchCommand } from './commands/batch.js';
import { receiptCommand } from './commands/receipt.js';

const program = new Command();

program
  .name('x402')
  .description('CLI tool for testing and interacting with x402 payment endpoints')
  .version('0.3.0');

program
  .command('test <url>')
  .description('Test an x402 endpoint by making a payment and receiving the resource')
  .option('-k, --key <privateKey>', 'Private key for signing payments (or set X402_PRIVATE_KEY env var)')
  .option('-a, --amount <amount>', 'Override payment amount')
  .option('-n, --network <network>', 'Network for payments (e.g., base-sepolia, base)')
  .option('-d, --dry-run', 'Show what would be paid without executing')
  .option('-v, --verbose', 'Show detailed payment flow')
  .option('--json', 'Output as JSON')
  .action(testEndpoint);

program
  .command('discover')
  .description('Discover available x402 endpoints in the network')
  .option('-f, --filter <type>', 'Filter by resource type')
  .option('-l, --limit <number>', 'Limit number of results', '20')
  .option('--json', 'Output as JSON')
  .action(discoverEndpoints);

program
  .command('info <url>')
  .description('Get payment requirements for an endpoint without paying')
  .option('-v, --verbose', 'Show full payment requirements JSON')
  .option('--json', 'Output as JSON')
  .action(getEndpointInfo);

program
  .command('verify <txHash>')
  .description('Verify a transaction hash corresponds to an x402 payment')
  .option('-n, --network <network>', 'Network to check (e.g., base-sepolia)', 'base-sepolia')
  .option('--json', 'Output as JSON')
  .action(verifyTransaction);

program
  .command('balance')
  .description('Check wallet ETH and USDC balance')
  .option('-k, --key <privateKey>', 'Private key (or set X402_PRIVATE_KEY env var)')
  .option('-a, --address <address>', 'Address to check (instead of deriving from key)')
  .option('-n, --network <network>', 'Network to check (default: base-sepolia)')
  .option('--json', 'Output as JSON')
  .action(balanceCommand);

program
  .command('config')
  .description('Manage x402 configuration')
  .option('--set <key=value>', 'Set a config value (privateKey, network, rpcUrl, facilitatorUrl)')
  .option('--unset <key>', 'Remove a config value')
  .action(configCommand);

program
  .command('watch <url>')
  .description('Monitor an endpoint for changes')
  .option('-i, --interval <seconds>', 'Check interval in seconds', '10')
  .option('-c, --count <number>', 'Number of checks (default: unlimited)')
  .option('--json', 'Output as JSON (one line per check)')
  .action(watchCommand);

program
  .command('batch <file>')
  .description('Test multiple endpoints from a file (one URL per line)')
  .option('-t, --timeout <seconds>', 'Timeout per request in seconds', '10')
  .option('--json', 'Output as JSON')
  .action(batchCommand);

program
  .command('receipt [id]')
  .description('View or export payment receipts')
  .option('-l, --list', 'List all receipts')
  .option('-e, --export <file>', 'Export receipt to file')
  .option('--json', 'Output as JSON')
  .action(receiptCommand);

program.parse();
