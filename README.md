# x402-cli

CLI for testing x402 payment endpoints. Compatible with **x402 v2**.

## What it does

- Test x402 endpoints and make payments
- Discover available x402 endpoints
- Check payment requirements without paying
- Verify transactions on-chain
- Monitor endpoints and manage wallets
- Run local mock servers for development

## Installation

```bash
npm install -g x402-cli
```

Or use directly with npx:

```bash
npx x402-cli <command>
```

## Quick Start

```bash
# Interactive setup wizard
x402 init

# Check what an endpoint accepts
x402 info https://api.example.com/resource

# Find available x402 APIs
x402 discover

# Test paying for something
x402 test https://api.example.com/resource --key YOUR_PRIVATE_KEY
```

## Commands

### Core Commands

| Command | Description |
|---------|-------------|
| `test <url>` | Make a payment and receive the resource |
| `info <url>` | Get payment requirements without paying |
| `verify <txHash>` | Verify a transaction on-chain |
| `balance` | Check wallet ETH and USDC balance |
| `discover` | Find x402 endpoints in the network |
| `config` | Manage x402 configuration |
| `watch <url>` | Monitor an endpoint for changes |
| `batch <file>` | Test multiple endpoints from a file |
| `receipt [id]` | View or export payment receipts |

### Developer Experience

| Command | Description |
|---------|-------------|
| `init` | Interactive setup wizard |
| `mock` | Start a local mock x402 server |
| `shell` | Interactive REPL mode |
| `diff <url>` | Monitor payment requirement changes |

### Wallet & Payments

| Command | Description |
|---------|-------------|
| `fund` | Get testnet ETH from faucets |
| `history` | View payment history |
| `estimate <url>` | Estimate total cost (payment + gas) |
| `allowance` | Check/set USDC allowance |
| `spend-limit` | Set spending safety limits |
| `wallet` | Manage multiple wallets |

### Analytics & Monitoring

| Command | Description |
|---------|-------------|
| `benchmark <url>` | Performance test an endpoint |
| `stats` | View aggregate usage statistics |
| `health <url>` | Check endpoint health |
| `alert` | Set up alerts for endpoint changes |
| `audit <address>` | Audit payments for an address |

### Integration & Automation

| Command | Description |
|---------|-------------|
| `curl <url>` | Generate curl command with payment headers |
| `openapi <url>` | Generate OpenAPI spec |
| `proxy` | Run local proxy that auto-handles 402s |
| `script <file>` | Run scripted test scenarios |

### Discovery & Registry

| Command | Description |
|---------|-------------|
| `register <url>` | Register endpoint in the directory |
| `browse` | Interactive endpoint browser |
| `star [url]` | Bookmark favorite endpoints |

## Examples

### Test an Endpoint

```bash
# Dry run to see what would be paid
x402 test https://api.example.com/weather --dry-run

# Make actual payment
x402 test https://api.example.com/weather --network base-sepolia --verbose
```

### Estimate Costs

```bash
x402 estimate https://api.example.com/resource
```

### Run Local Mock Server

```bash
# Start mock server on port 3402
x402 mock --port 3402 --price 100

# Test against mock
x402 test http://localhost:3402/resource
```

### Interactive Shell

```bash
x402 shell

x402> info https://api.example.com/resource
x402> balance
x402> test https://api.example.com/resource
x402> exit
```

### Script Automation

Create `test-script.yaml`:

```yaml
name: API Test Suite
steps:
  - name: Check weather API
    action: info
    url: https://api.example.com/weather

  - name: Wait a bit
    action: wait
    delay: 1000

  - name: Test payment
    action: test
    url: https://api.example.com/weather
```

Run:

```bash
x402 script test-script.yaml --dry-run
```

### Set Spending Limits

```bash
# Set daily limit
x402 spend-limit --daily 10

# Set per-transaction limit
x402 spend-limit --set 1

# View current limits
x402 spend-limit
```

### Manage Wallets

```bash
# Add a new wallet
x402 wallet add

# List wallets
x402 wallet list

# Set default wallet
x402 wallet default
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

Or use the global config:

```bash
x402 config --set privateKey=0x...
x402 config --set network=base-sepolia
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
