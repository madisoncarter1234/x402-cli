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
    'sepolia': 'https://rpc.sepolia.org',
    'arbitrum': 'https://arb1.arbitrum.io/rpc',
    'arbitrum-one': 'https://arb1.arbitrum.io/rpc',
    'arbitrum-sepolia': 'https://sepolia-rollup.arbitrum.io/rpc',
    'optimism': 'https://mainnet.optimism.io',
    'optimism-sepolia': 'https://sepolia.optimism.io',
    'polygon': 'https://polygon-rpc.com',
    'polygon-amoy': 'https://rpc-amoy.polygon.technology'
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
  'sepolia': 11155111,
  'arbitrum': 42161,
  'arbitrum-one': 42161,
  'arbitrum-sepolia': 421614,
  'optimism': 10,
  'optimism-sepolia': 11155420,
  'polygon': 137,
  'polygon-amoy': 80002
};

// USDC contract addresses
export const USDC_ADDRESSES: Record<string, `0x${string}`> = {
  'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-mainnet': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'ethereum': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  'mainnet': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  'sepolia': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  'arbitrum': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  'arbitrum-one': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  'arbitrum-sepolia': '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  'optimism': '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  'optimism-sepolia': '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
  'polygon': '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  'polygon-amoy': '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582'
};

// Supported network names for display/help
export const SUPPORTED_NETWORKS = [
  'base', 'base-sepolia',
  'ethereum', 'sepolia',
  'arbitrum', 'arbitrum-sepolia',
  'optimism', 'optimism-sepolia',
  'polygon', 'polygon-amoy'
];
