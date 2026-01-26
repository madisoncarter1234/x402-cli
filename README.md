# x402-cli

CLI for testing x402 payment endpoints. Compatible with **x402 v2**.

## What it does

- Test x402 endpoints and make payments
- Discover available x402 endpoints
- Check payment requirements without paying
- Verify transactions on-chain

## Installation

```bash
npm install -g x402-cli
```

Or use directly with npx:

```bash
npx x402-cli <command>
```

## Quick Start

Check what an endpoint accepts:
```bash
x402 info https://api.example.com/resource
```

Find available x402 APIs:
```bash
x402 discover
```

Test paying for something:
```bash
x402 test https://api.example.com/resource --key YOUR_PRIVATE_KEY
```

## Commands

### `x402 test <url>`

Test an endpoint by making a payment.

Options:
- `-k, --key <privateKey>` - Private key for signing payments (or set X402_PRIVATE_KEY env var)
- `-n, --network <network>` - Network for payments (default: base-sepolia)
- `-a, --amount <amount>` - Override payment amount
- `-v, --verbose` - Show detailed payment flow

**Example:**
```bash
x402 test https://api.example.com/weather --network base-sepolia --verbose
```

### `x402 discover`

Find x402 endpoints.

Options:
- `-f, --filter <type>` - Filter by resource type
- `-l, --limit <number>` - Limit number of results (default: 20)

**Example:**
```bash
x402 discover --filter api --limit 10
```

### `x402 info <url>`

Get payment info without paying.

Options:
- `-v, --verbose` - Show full payment requirements JSON

**Example:**
```bash
x402 info https://api.example.com/premium --verbose
```

### `x402 verify <txHash>`

Check if a transaction was an x402 payment.

Options:
- `-n, --network <network>` - Network to check (default: base-sepolia)

**Example:**
```bash
x402 verify 0x1234... --network base
```

## Supported Networks

- `base` / `base-mainnet` - Base Mainnet (chain ID: 8453)
- `base-sepolia` - Base Sepolia testnet (chain ID: 84532)
- `ethereum` / `mainnet` - Ethereum Mainnet (chain ID: 1)
- `sepolia` - Ethereum Sepolia testnet (chain ID: 11155111)

## Configuration

Create a `.env` file in your working directory:

```bash
X402_PRIVATE_KEY=your_private_key_here
X402_NETWORK=base-sepolia
X402_RPC_URL=https://your-rpc-endpoint.com  # optional
X402_FACILITATOR_URL=https://x402.org/facilitator  # optional
```

## x402 v2 Compatibility

This CLI is built for x402 v2 and uses:
- `@x402/core` - Core types and client
- `@x402/axios` - HTTP client wrapper with automatic payment handling
- `@x402/evm` - EVM payment scheme (Exact scheme with EIP-3009)

The CLI supports both v2 (header-based) and v1 (body-based) payment requirement formats.

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev test https://example.com

# Build
npm run build

# Test locally
npm link
x402 --help
```

## Contributing

PRs welcome. This is meant to make testing x402 endpoints easier.

## License

MIT
