import { logger } from '../utils/logger.js';
import { saveConfig, getConfigPath } from '../utils/config.js';
import ora from 'ora';
import prompts from 'prompts';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';

interface InitOptions {
  force?: boolean;
  json?: boolean;
}

export async function initCommand(options: InitOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('x402 CLI Setup Wizard');

  const spinner = ora();

  try {
    // Check if already configured
    const envPath = join(process.cwd(), '.env');
    const configPath = getConfigPath();

    if ((existsSync(envPath) || existsSync(configPath)) && !options.force) {
      logger.warn('x402 is already configured in this directory.');
      logger.info(`Config: ${configPath}`);

      const { proceed } = await prompts({
        type: 'confirm',
        name: 'proceed',
        message: 'Do you want to reconfigure?',
        initial: false
      });

      if (!proceed) {
        logger.info('Setup cancelled. Use --force to override.');
        if (options.json) logger.outputJson();
        return;
      }
    }

    logger.log('\nThis wizard will help you set up x402-cli for making payments.\n');

    // Step 1: Wallet setup
    logger.header('Step 1: Wallet Setup');

    const { walletChoice } = await prompts({
      type: 'select',
      name: 'walletChoice',
      message: 'How would you like to set up your wallet?',
      choices: [
        { title: 'Generate new wallet (recommended for testing)', value: 'generate' },
        { title: 'Import existing private key', value: 'import' },
        { title: 'Skip wallet setup', value: 'skip' }
      ]
    });

    let privateKey: string | undefined;
    let address: string | undefined;

    if (walletChoice === 'generate') {
      spinner.start('Generating new wallet');
      privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      address = account.address;
      spinner.succeed('Wallet generated');

      logger.log('');
      logger.success('New wallet created!');
      logger.keyValue('Address', address);
      logger.warn('⚠️  Save your private key securely - it will only be shown once!');
      logger.log(`\nPrivate Key: ${privateKey}\n`);

      logger.setJsonData('wallet', { address, generated: true });

    } else if (walletChoice === 'import') {
      const { key } = await prompts({
        type: 'password',
        name: 'key',
        message: 'Enter your private key:',
        validate: (v) => {
          if (!v) return 'Private key is required';
          const formatted = v.startsWith('0x') ? v : `0x${v}`;
          if (!/^0x[a-fA-F0-9]{64}$/.test(formatted)) {
            return 'Invalid private key format';
          }
          return true;
        }
      });

      privateKey = key.startsWith('0x') ? key : `0x${key}`;
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      address = account.address;

      logger.success('Wallet imported');
      logger.keyValue('Address', address);
      logger.setJsonData('wallet', { address, generated: false });
    }

    // Step 2: Network selection
    logger.header('Step 2: Network Selection');

    const { network } = await prompts({
      type: 'select',
      name: 'network',
      message: 'Which network do you want to use?',
      choices: [
        { title: 'Base Sepolia (testnet - recommended for testing)', value: 'base-sepolia' },
        { title: 'Base Mainnet (production)', value: 'base' },
        { title: 'Ethereum Sepolia (testnet)', value: 'sepolia' },
        { title: 'Ethereum Mainnet (production)', value: 'ethereum' }
      ],
      initial: 0
    });

    logger.setJsonData('network', network);

    // Step 3: Storage preference
    logger.header('Step 3: Configuration Storage');

    const { storageChoice } = await prompts({
      type: 'select',
      name: 'storageChoice',
      message: 'Where should we store your configuration?',
      choices: [
        { title: 'Global config (~/.x402/config.json)', value: 'global' },
        { title: 'Local .env file (current directory)', value: 'local' },
        { title: 'Both', value: 'both' }
      ]
    });

    // Save configuration
    spinner.start('Saving configuration');

    const config: any = { network };
    if (privateKey) {
      config.privateKey = privateKey;
    }

    if (storageChoice === 'global' || storageChoice === 'both') {
      saveConfig(config);
      logger.info(`Global config saved: ${configPath}`);
    }

    if (storageChoice === 'local' || storageChoice === 'both') {
      let envContent = '';
      if (privateKey) {
        envContent += `X402_PRIVATE_KEY=${privateKey}\n`;
      }
      envContent += `X402_NETWORK=${network}\n`;

      writeFileSync(envPath, envContent);
      logger.info(`Local .env saved: ${envPath}`);

      // Add to .gitignore if it exists
      const gitignorePath = join(process.cwd(), '.gitignore');
      if (existsSync(gitignorePath)) {
        const gitignore = require('fs').readFileSync(gitignorePath, 'utf-8');
        if (!gitignore.includes('.env')) {
          writeFileSync(gitignorePath, gitignore + '\n.env\n');
          logger.info('Added .env to .gitignore');
        }
      }
    }

    spinner.succeed('Configuration saved');

    // Step 4: Next steps
    logger.header('Setup Complete! 🎉');

    logger.log('\nNext steps:\n');

    if (network.includes('sepolia') && address) {
      logger.log(`1. Get testnet ETH: x402 fund`);
      logger.log(`2. Check your balance: x402 balance`);
    } else {
      logger.log(`1. Check your balance: x402 balance`);
    }

    logger.log(`3. Test an endpoint: x402 info <url>`);
    logger.log(`4. Make a payment: x402 test <url>\n`);

    if (network.includes('sepolia')) {
      logger.info('Tip: Use testnet faucets to get free ETH for gas fees');
      logger.info('  Base Sepolia: https://portal.cdp.coinbase.com/products/faucet');
    }

    logger.setJsonData('setup', 'complete');
    logger.setJsonData('configPath', storageChoice === 'local' ? envPath : configPath);

    if (options.json) logger.outputJson();

  } catch (error: any) {
    spinner.fail('Setup failed');
    logger.error(error.message);
    logger.setJsonData('error', error.message);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
