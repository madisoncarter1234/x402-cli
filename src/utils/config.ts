import { config } from 'dotenv';
import { resolve, join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';

// Load .env from current directory
config({ path: resolve(process.cwd(), '.env') });

// Config file path
const CONFIG_DIR = join(homedir(), '.x402');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface X402Config {
  privateKey?: string;
  network?: string;
  rpcUrl?: string;
  facilitatorUrl?: string;
}

let cachedConfig: X402Config | null = null;

export function loadConfig(): X402Config {
  if (cachedConfig) return cachedConfig;

  cachedConfig = {};

  // Load from config file if it exists
  if (existsSync(CONFIG_FILE)) {
    try {
      const content = readFileSync(CONFIG_FILE, 'utf-8');
      cachedConfig = JSON.parse(content);
    } catch {
      // Invalid config file, ignore
    }
  }

  return cachedConfig!;
}

export function saveConfig(updates: Partial<X402Config>): void {
  const current = loadConfig();
  const newConfig: X402Config = { ...current, ...updates };

  // Ensure directory exists
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2));
  cachedConfig = newConfig;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function getPrivateKey(cliKey?: string): string | undefined {
  // Priority: CLI flag > env var > config file
  return cliKey || process.env.X402_PRIVATE_KEY || loadConfig().privateKey;
}

export function getNetwork(cliNetwork?: string): string {
  return cliNetwork || process.env.X402_NETWORK || loadConfig().network || 'base-sepolia';
}

export function getFacilitatorUrl(): string {
  return process.env.X402_FACILITATOR_URL || loadConfig().facilitatorUrl || 'https://x402.org/facilitator';
}

export function getRpcUrl(network?: string): string {
  // Check env var first
  if (process.env.X402_RPC_URL) {
    return process.env.X402_RPC_URL;
  }

  // Check config file
  const configRpc = loadConfig().rpcUrl;
  if (configRpc) {
    return configRpc;
  }

  const networkName = network || getNetwork();

  // Default public RPC endpoints
  const defaultRpcs: Record<string, string> = {
    'base': 'https://mainnet.base.org',
    'base-mainnet': 'https://mainnet.base.org',
    'base-sepolia': 'https://sepolia.base.org',
    'ethereum': 'https://eth.llamarpc.com',
    'mainnet': 'https://eth.llamarpc.com',
    'sepolia': 'https://rpc.sepolia.org'
  };

  return defaultRpcs[networkName.toLowerCase()] || defaultRpcs['base-sepolia'];
}

// Chain ID mapping
export const NETWORK_CHAIN_IDS: Record<string, number> = {
  'base': 8453,
  'base-mainnet': 8453,
  'base-sepolia': 84532,
  'ethereum': 1,
  'mainnet': 1,
  'sepolia': 11155111
};

// USDC contract addresses
export const USDC_ADDRESSES: Record<string, `0x${string}`> = {
  'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-mainnet': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'ethereum': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  'mainnet': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  'sepolia': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
};
