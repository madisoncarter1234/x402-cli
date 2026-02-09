import { logger } from '../utils/logger.js';
import ora from 'ora';
import prompts from 'prompts';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';

interface WalletOptions {
  json?: boolean;
}

interface WalletEntry {
  name: string;
  address: string;
  privateKey: string;
  createdAt: string;
  isDefault?: boolean;
}

interface WalletsFile {
  version: number;
  wallets: WalletEntry[];
  defaultWallet?: string;
}

const WALLETS_FILE = join(homedir(), '.x402', 'wallets.json');

function loadWallets(): WalletsFile {
  if (existsSync(WALLETS_FILE)) {
    try {
      return JSON.parse(readFileSync(WALLETS_FILE, 'utf-8'));
    } catch {
      return { version: 1, wallets: [] };
    }
  }
  return { version: 1, wallets: [] };
}

function saveWallets(data: WalletsFile): void {
  const dir = join(homedir(), '.x402');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(WALLETS_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export async function walletCommand(action: string | undefined, options: WalletOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('Wallet Manager');

  const spinner = ora();

  try {
    const data = loadWallets();

    switch (action) {
      case 'list':
      case undefined: {
        if (data.wallets.length === 0) {
          logger.info('No wallets configured');
          logger.log('\nUse "x402 wallet add" to add a wallet');
          logger.setJsonData('wallets', []);
        } else {
          logger.header('Configured Wallets');

          const walletList = data.wallets.map(w => ({
            name: w.name,
            address: w.address,
            isDefault: w.name === data.defaultWallet,
            createdAt: w.createdAt
          }));

          for (const wallet of walletList) {
            const defaultMarker = wallet.isDefault ? ' (default)' : '';
            logger.log(`\n  ${wallet.name}${defaultMarker}`);
            logger.keyValue('  Address', wallet.address);
            logger.keyValue('  Created', new Date(wallet.createdAt).toLocaleDateString());
          }

          logger.setJsonData('wallets', walletList);
          logger.setJsonData('defaultWallet', data.defaultWallet);
        }
        break;
      }

      case 'add': {
        const { name } = await prompts({
          type: 'text',
          name: 'name',
          message: 'Wallet name (alias):',
          validate: v => {
            if (!v) return 'Name is required';
            if (data.wallets.some(w => w.name === v)) return 'Wallet with this name already exists';
            return true;
          }
        });

        if (!name) {
          logger.info('Cancelled');
          if (options.json) logger.outputJson();
          return;
        }

        const { source } = await prompts({
          type: 'select',
          name: 'source',
          message: 'How do you want to add the wallet?',
          choices: [
            { title: 'Generate new wallet', value: 'generate' },
            { title: 'Import private key', value: 'import' }
          ]
        });

        let privateKey: string;
        let address: string;

        if (source === 'generate') {
          spinner.start('Generating wallet');
          privateKey = generatePrivateKey();
          const account = privateKeyToAccount(privateKey as `0x${string}`);
          address = account.address;
          spinner.succeed('Wallet generated');

          logger.warn('⚠️  Save your private key - it will only be shown once!');
          logger.log(`\nPrivate Key: ${privateKey}\n`);
        } else {
          const { key } = await prompts({
            type: 'password',
            name: 'key',
            message: 'Enter private key:',
            validate: v => {
              if (!v) return 'Private key required';
              const formatted = v.startsWith('0x') ? v : `0x${v}`;
              if (!/^0x[a-fA-F0-9]{64}$/.test(formatted)) return 'Invalid private key';
              return true;
            }
          });

          privateKey = key.startsWith('0x') ? key : `0x${key}`;
          const account = privateKeyToAccount(privateKey as `0x${string}`);
          address = account.address;
        }

        const wallet: WalletEntry = {
          name,
          address,
          privateKey,
          createdAt: new Date().toISOString()
        };

        data.wallets.push(wallet);

        // Set as default if it's the first wallet
        if (data.wallets.length === 1) {
          data.defaultWallet = name;
        }

        saveWallets(data);

        logger.success(`Wallet "${name}" added`);
        logger.keyValue('Address', address);

        logger.setJsonData('action', 'add');
        logger.setJsonData('wallet', { name, address });
        break;
      }

      case 'remove':
      case 'rm': {
        if (data.wallets.length === 0) {
          logger.info('No wallets to remove');
          if (options.json) logger.outputJson();
          return;
        }

        const { walletName } = await prompts({
          type: 'select',
          name: 'walletName',
          message: 'Select wallet to remove:',
          choices: data.wallets.map(w => ({
            title: `${w.name} (${w.address.substring(0, 10)}...)`,
            value: w.name
          }))
        });

        if (!walletName) {
          logger.info('Cancelled');
          if (options.json) logger.outputJson();
          return;
        }

        const { confirm } = await prompts({
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to remove wallet "${walletName}"?`,
          initial: false
        });

        if (!confirm) {
          logger.info('Cancelled');
          if (options.json) logger.outputJson();
          return;
        }

        data.wallets = data.wallets.filter(w => w.name !== walletName);

        if (data.defaultWallet === walletName) {
          data.defaultWallet = data.wallets[0]?.name;
        }

        saveWallets(data);

        logger.success(`Wallet "${walletName}" removed`);
        logger.setJsonData('action', 'remove');
        logger.setJsonData('removed', walletName);
        break;
      }

      case 'default': {
        if (data.wallets.length === 0) {
          logger.info('No wallets configured');
          if (options.json) logger.outputJson();
          return;
        }

        const { walletName } = await prompts({
          type: 'select',
          name: 'walletName',
          message: 'Select default wallet:',
          choices: data.wallets.map(w => ({
            title: `${w.name} (${w.address.substring(0, 10)}...)${w.name === data.defaultWallet ? ' (current)' : ''}`,
            value: w.name
          }))
        });

        if (!walletName) {
          logger.info('Cancelled');
          if (options.json) logger.outputJson();
          return;
        }

        data.defaultWallet = walletName;
        saveWallets(data);

        logger.success(`Default wallet set to "${walletName}"`);
        logger.setJsonData('action', 'default');
        logger.setJsonData('defaultWallet', walletName);
        break;
      }

      case 'export': {
        if (data.wallets.length === 0) {
          logger.info('No wallets to export');
          if (options.json) logger.outputJson();
          return;
        }

        const { walletName } = await prompts({
          type: 'select',
          name: 'walletName',
          message: 'Select wallet to export:',
          choices: data.wallets.map(w => ({
            title: `${w.name} (${w.address.substring(0, 10)}...)`,
            value: w.name
          }))
        });

        if (!walletName) {
          logger.info('Cancelled');
          if (options.json) logger.outputJson();
          return;
        }

        const wallet = data.wallets.find(w => w.name === walletName);
        if (!wallet) {
          logger.error('Wallet not found');
          if (options.json) logger.outputJson();
          return;
        }

        const { confirm } = await prompts({
          type: 'confirm',
          name: 'confirm',
          message: 'This will display your private key. Continue?',
          initial: false
        });

        if (!confirm) {
          logger.info('Cancelled');
          if (options.json) logger.outputJson();
          return;
        }

        logger.header(`Wallet: ${wallet.name}`);
        logger.keyValue('Address', wallet.address);
        logger.log(`\nPrivate Key: ${wallet.privateKey}\n`);
        logger.warn('Keep this private key secure!');

        logger.setJsonData('action', 'export');
        logger.setJsonData('wallet', { name: wallet.name, address: wallet.address });
        break;
      }

      default:
        logger.error(`Unknown action: ${action}`);
        logger.log('\nAvailable actions:');
        logger.log('  list    - List all wallets (default)');
        logger.log('  add     - Add a new wallet');
        logger.log('  remove  - Remove a wallet');
        logger.log('  default - Set default wallet');
        logger.log('  export  - Export wallet private key');
    }

    if (options.json) logger.outputJson();

  } catch (error: any) {
    spinner.fail('Wallet operation failed');
    logger.error(error.message);
    logger.setJsonData('error', error.message);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
