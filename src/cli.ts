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

// New commands
import { fundCommand } from './commands/fund.js';
import { historyCommand } from './commands/history.js';
import { estimateCommand } from './commands/estimate.js';
import { allowanceCommand } from './commands/allowance.js';
import { spendLimitCommand } from './commands/spend-limit.js';
import { initCommand } from './commands/init.js';
import { mockCommand } from './commands/mock.js';
import { shellCommand } from './commands/shell.js';
import { diffCommand } from './commands/diff.js';
import { benchmarkCommand } from './commands/benchmark.js';
import { statsCommand } from './commands/stats.js';
import { healthCommand } from './commands/health.js';
import { curlCommand } from './commands/curl.js';
import { openapiCommand } from './commands/openapi.js';
import { proxyCommand } from './commands/proxy.js';
import { scriptCommand } from './commands/script.js';
import { walletCommand } from './commands/wallet.js';
import { auditCommand } from './commands/audit.js';
import { alertCommand } from './commands/alert.js';
import { registerCommand } from './commands/register.js';
import { browseCommand } from './commands/browse.js';
import { starCommand } from './commands/star.js';

const program = new Command();

program
  .name('x402')
  .description('CLI tool for testing and interacting with x402 payment endpoints')
  .version('0.4.0');

// ========== CORE COMMANDS ==========

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

// ========== DEVELOPER EXPERIENCE ==========

program
  .command('init')
  .description('Interactive setup wizard - configure wallet, network, and environment')
  .option('-f, --force', 'Force reconfiguration even if already set up')
  .option('--json', 'Output as JSON')
  .action(initCommand);

program
  .command('mock')
  .description('Start a local mock x402 server for testing')
  .option('-p, --port <port>', 'Port to listen on', '3402')
  .option('--price <amount>', 'Payment price in raw units', '100')
  .option('--asset <asset>', 'Payment asset', 'USDC')
  .option('--recipient <address>', 'Payment recipient address')
  .option('--json', 'Output as JSON')
  .action(mockCommand);

program
  .command('shell')
  .description('Start interactive REPL mode for testing')
  .option('-k, --key <privateKey>', 'Private key for signing')
  .option('-n, --network <network>', 'Network to use')
  .action(shellCommand);

program
  .command('diff <url>')
  .description('Monitor payment requirements for changes over time')
  .option('-i, --interval <seconds>', 'Check interval in seconds', '5')
  .option('-c, --count <number>', 'Number of checks (default: unlimited)')
  .option('--json', 'Output as JSON')
  .action(diffCommand);

// ========== WALLET & PAYMENTS ==========

program
  .command('fund')
  .description('Get testnet ETH from faucets')
  .option('-k, --key <privateKey>', 'Private key')
  .option('-n, --network <network>', 'Testnet network (base-sepolia, sepolia)')
  .option('--json', 'Output as JSON')
  .action(fundCommand);

program
  .command('history')
  .description('View payment history from local receipts and on-chain')
  .option('-k, --key <privateKey>', 'Private key')
  .option('-a, --address <address>', 'Address to check')
  .option('-n, --network <network>', 'Network')
  .option('-l, --limit <number>', 'Limit results', '20')
  .option('--onchain', 'Include on-chain USDC transfer history')
  .option('--json', 'Output as JSON')
  .action(historyCommand);

program
  .command('estimate <url>')
  .description('Estimate total cost (payment + gas) for an endpoint')
  .option('-k, --key <privateKey>', 'Private key (to check balance)')
  .option('-n, --network <network>', 'Network')
  .option('--json', 'Output as JSON')
  .action(estimateCommand);

program
  .command('allowance')
  .description('Check or set USDC allowance for spender contracts')
  .option('-k, --key <privateKey>', 'Private key')
  .option('-n, --network <network>', 'Network')
  .option('-s, --spender <address>', 'Spender address to check/approve')
  .option('-a, --amount <amount>', 'Amount to approve (use "max" for unlimited)')
  .option('--json', 'Output as JSON')
  .action(allowanceCommand);

program
  .command('spend-limit')
  .description('Set spending limits for safety')
  .option('--set <amount>', 'Set per-transaction limit in USDC')
  .option('--daily <amount>', 'Set daily spending limit')
  .option('--session <amount>', 'Set session spending limit')
  .option('--reset', 'Reset all limits')
  .option('--json', 'Output as JSON')
  .action(spendLimitCommand);

program
  .command('wallet [action]')
  .description('Manage multiple wallets (list, add, remove, default, export)')
  .option('--json', 'Output as JSON')
  .action(walletCommand);

// ========== ANALYTICS & MONITORING ==========

program
  .command('benchmark <url>')
  .description('Performance test an endpoint')
  .option('-r, --requests <number>', 'Number of requests', '100')
  .option('-c, --concurrent <number>', 'Concurrent requests', '10')
  .option('-t, --timeout <seconds>', 'Timeout per request', '10')
  .option('--pay', 'Include actual payments in benchmark')
  .option('-k, --key <privateKey>', 'Private key (if --pay)')
  .option('--json', 'Output as JSON')
  .action(benchmarkCommand);

program
  .command('stats')
  .description('View aggregate usage statistics')
  .option('-p, --period <period>', 'Time period (today, week, month)')
  .option('--json', 'Output as JSON')
  .action(statsCommand);

program
  .command('health <url>')
  .description('Check endpoint health and x402 configuration')
  .option('-t, --timeout <seconds>', 'Request timeout', '10')
  .option('-f, --full', 'Show full payment requirements')
  .option('--json', 'Output as JSON')
  .action(healthCommand);

program
  .command('alert')
  .description('Set up alerts for endpoint changes')
  .option('--add <url>', 'Add alert for endpoint')
  .option('--remove <url>', 'Remove alert')
  .option('--list', 'List all alerts')
  .option('--check', 'Check all alerts now')
  .option('--webhook <url>', 'Webhook URL for notifications')
  .option('--json', 'Output as JSON')
  .action(alertCommand);

program
  .command('audit <address>')
  .description('Audit x402 payments for an address')
  .option('-n, --network <network>', 'Network to audit')
  .option('-b, --blocks <number>', 'Number of blocks to scan', '10000')
  .option('--json', 'Output as JSON')
  .action(auditCommand);

// ========== INTEGRATION & AUTOMATION ==========

program
  .command('curl <url>')
  .description('Generate curl command with x402 payment headers')
  .option('-X, --method <method>', 'HTTP method', 'GET')
  .option('-H, --headers <headers...>', 'Additional headers')
  .option('-d, --data <data>', 'Request body')
  .option('--json', 'Output as JSON')
  .action(curlCommand);

program
  .command('openapi <url>')
  .description('Generate OpenAPI spec from x402 endpoint')
  .option('-o, --output <file>', 'Output file path')
  .option('-t, --title <title>', 'API title')
  .option('--json', 'Output as JSON')
  .action(openapiCommand);

program
  .command('proxy')
  .description('Run local proxy that auto-handles 402 payments')
  .option('-p, --port <port>', 'Port to listen on', '3401')
  .option('-k, --key <privateKey>', 'Private key for payments')
  .option('-n, --network <network>', 'Network for payments')
  .option('--allowlist <hosts>', 'Comma-separated list of allowed hosts')
  .option('--json', 'Output as JSON')
  .action(proxyCommand);

program
  .command('script <file>')
  .description('Run scripted test scenarios from YAML/JSON file')
  .option('-k, --key <privateKey>', 'Private key')
  .option('-n, --network <network>', 'Network')
  .option('-d, --dry-run', 'Dry run (no actual payments)')
  .option('--json', 'Output as JSON')
  .action(scriptCommand);

// ========== DISCOVERY & REGISTRY ==========

program
  .command('register <url>')
  .description('Register an endpoint in the x402 directory')
  .option('--name <name>', 'Endpoint name')
  .option('--description <desc>', 'Endpoint description')
  .option('--category <cat>', 'Category (api, data, ai, media, finance, other)')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--json', 'Output as JSON')
  .action(registerCommand);

program
  .command('browse')
  .description('Interactive browser for discovering x402 endpoints')
  .option('-c, --category <category>', 'Filter by category')
  .option('--json', 'Output as JSON')
  .action(browseCommand);

program
  .command('star [url]')
  .description('Bookmark favorite endpoints')
  .option('-r, --remove', 'Remove star')
  .option('-l, --list', 'List starred endpoints')
  .option('--json', 'Output as JSON')
  .action(starCommand);

program.parse();
