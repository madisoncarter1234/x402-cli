import { logger } from '../utils/logger.js';
import { getPrivateKey, getNetwork } from '../utils/config.js';
import ora from 'ora';
import prompts from 'prompts';
import { privateKeyToAccount } from 'viem/accounts';
import { testEndpoint } from './test.js';
import { getEndpointInfo } from './info.js';
import { balanceCommand } from './balance.js';
import { verifyTransaction } from './verify.js';
import { estimateCommand } from './estimate.js';
import { historyCommand } from './history.js';

interface ShellOptions {
  key?: string;
  network?: string;
}

const HELP_TEXT = `
Available commands:
  test <url>      - Make a payment to an endpoint
  info <url>      - Get payment requirements
  estimate <url>  - Estimate payment cost
  balance         - Check wallet balance
  verify <txHash> - Verify a transaction
  history         - View payment history
  set <key=value> - Set session variable
  vars            - Show session variables
  help            - Show this help
  exit            - Exit the shell
`;

export async function shellCommand(options: ShellOptions) {
  logger.header('x402 Interactive Shell');

  // Session state
  let sessionVars: Record<string, string> = {
    network: getNetwork(options.network),
    verbose: 'false'
  };

  const privateKey = getPrivateKey(options.key);
  if (privateKey) {
    const formattedKey = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
    const account = privateKeyToAccount(formattedKey);
    logger.info(`Wallet: ${account.address}`);
    sessionVars.wallet = account.address;
  }

  logger.info(`Network: ${sessionVars.network}`);
  logger.log('\nType "help" for available commands, "exit" to quit.\n');

  // Command history
  const commandHistory: string[] = [];

  while (true) {
    const { input } = await prompts({
      type: 'text',
      name: 'input',
      message: 'x402>'
    }, {
      onCancel: () => {
        logger.log('\nGoodbye!');
        process.exit(0);
      }
    });

    if (!input || input.trim() === '') continue;

    const trimmed = input.trim();
    commandHistory.push(trimmed);

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    try {
      switch (cmd) {
        case 'exit':
        case 'quit':
        case 'q':
          logger.log('Goodbye!');
          process.exit(0);
          break;

        case 'help':
        case '?':
          logger.log(HELP_TEXT);
          break;

        case 'test':
          if (!args[0]) {
            logger.error('Usage: test <url>');
            break;
          }
          await testEndpoint(args[0], {
            key: options.key,
            network: sessionVars.network,
            verbose: sessionVars.verbose === 'true'
          });
          break;

        case 'info':
          if (!args[0]) {
            logger.error('Usage: info <url>');
            break;
          }
          await getEndpointInfo(args[0], {
            verbose: sessionVars.verbose === 'true'
          });
          break;

        case 'estimate':
          if (!args[0]) {
            logger.error('Usage: estimate <url>');
            break;
          }
          await estimateCommand(args[0], {
            key: options.key,
            network: sessionVars.network
          });
          break;

        case 'balance':
        case 'bal':
          await balanceCommand({
            key: options.key,
            network: sessionVars.network
          });
          break;

        case 'verify':
          if (!args[0]) {
            logger.error('Usage: verify <txHash>');
            break;
          }
          await verifyTransaction(args[0], {
            network: sessionVars.network
          });
          break;

        case 'history':
          await historyCommand({
            key: options.key,
            limit: '10'
          });
          break;

        case 'set':
          if (!args[0] || !args[0].includes('=')) {
            logger.error('Usage: set <key=value>');
            logger.log('  Example: set verbose=true');
            logger.log('  Example: set network=base');
            break;
          }
          const [key, ...valueParts] = args[0].split('=');
          const value = valueParts.join('=');
          sessionVars[key] = value;
          logger.success(`Set ${key}=${value}`);
          break;

        case 'vars':
          logger.header('Session Variables');
          for (const [k, v] of Object.entries(sessionVars)) {
            logger.keyValue(k, v);
          }
          break;

        case 'clear':
          console.clear();
          break;

        case 'history':
          logger.header('Command History');
          commandHistory.slice(-10).forEach((cmd, i) => {
            logger.log(`  ${i + 1}. ${cmd}`);
          });
          break;

        default:
          logger.error(`Unknown command: ${cmd}`);
          logger.info('Type "help" for available commands');
      }
    } catch (error: any) {
      logger.error(`Command failed: ${error.message}`);
    }

    logger.log(''); // Empty line between commands
  }
}
