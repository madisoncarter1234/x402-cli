import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

export function getPrivateKey(cliKey?: string): string | undefined {
  return cliKey || process.env.X402_PRIVATE_KEY;
}

export function getFacilitatorUrl(): string {
  return process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator';
}

export function getRpcUrl(network?: string): string {
  if (process.env.X402_RPC_URL) {
    return process.env.X402_RPC_URL;
  }

  const networkName = network || process.env.X402_NETWORK || 'base-sepolia';

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
