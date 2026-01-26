import { logger } from '../utils/logger.js';
import { loadConfig, saveConfig, getConfigPath } from '../utils/config.js';

interface ConfigOptions {
  set?: string;
  unset?: string;
}

export async function configCommand(options: ConfigOptions) {
  const configPath = getConfigPath();

  if (options.set) {
    // Parse key=value
    const eqIndex = options.set.indexOf('=');
    if (eqIndex === -1) {
      logger.error('Invalid format. Use: --set key=value');
      process.exit(1);
    }

    const key = options.set.substring(0, eqIndex);
    const value = options.set.substring(eqIndex + 1);

    const validKeys = ['privateKey', 'network', 'rpcUrl', 'facilitatorUrl'];
    if (!validKeys.includes(key)) {
      logger.error(`Invalid key: ${key}. Valid keys: ${validKeys.join(', ')}`);
      process.exit(1);
    }

    saveConfig({ [key]: value });
    logger.success(`Set ${key} in ${configPath}`);
    return;
  }

  if (options.unset) {
    const validKeys = ['privateKey', 'network', 'rpcUrl', 'facilitatorUrl'];
    if (!validKeys.includes(options.unset)) {
      logger.error(`Invalid key: ${options.unset}. Valid keys: ${validKeys.join(', ')}`);
      process.exit(1);
    }

    const current = loadConfig();
    delete (current as any)[options.unset];
    saveConfig(current);
    logger.success(`Removed ${options.unset} from config`);
    return;
  }

  // Show current config
  logger.header('x402 Configuration');
  logger.keyValue('Config file', configPath);

  const config = loadConfig();

  if (Object.keys(config).length === 0) {
    logger.info('No configuration set');
    logger.log('\nSet config with: x402 config --set key=value');
    logger.log('Valid keys: privateKey, network, rpcUrl, facilitatorUrl');
    return;
  }

  logger.log('');
  for (const [key, value] of Object.entries(config)) {
    if (key === 'privateKey' && value) {
      // Mask private key
      logger.keyValue(key, value.substring(0, 6) + '...' + value.substring(value.length - 4));
    } else {
      logger.keyValue(key, value as string);
    }
  }
}
