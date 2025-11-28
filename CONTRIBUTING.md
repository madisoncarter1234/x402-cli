# Contributing

## Structure

```
x402-cli/
├── src/
│   ├── cli.ts              # Main CLI entry point
│   ├── commands/           # Command implementations
│   │   ├── test.ts         # Test endpoint command
│   │   ├── discover.ts     # Discover endpoints command
│   │   ├── info.ts         # Get endpoint info command
│   │   └── verify.ts       # Verify transaction command
│   ├── utils/              # Utility functions
│   │   ├── logger.ts       # Colored logging
│   │   └── config.ts       # Configuration handling
│   └── index.ts            # Package exports
├── dist/                   # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── README.md
```

## Development

1. Install dependencies:
```bash
npm install
```

2. Run in development mode:
```bash
npm run dev -- info https://example.com
```

3. Build:
```bash
npm run build
```

4. Test locally:
```bash
npm link
x402 --help
```

## Adding New Commands

1. Create a new file in `src/commands/your-command.ts`
2. Export a function with the command logic
3. Add the command to `src/cli.ts`
4. Update README.md with command documentation

## Style

Just follow what's already there. Use the logger for output.

## TODO

- Complete payment flow with x402 SDK
- Wallet integration for signing
- On-chain verification
- Support more payment schemes
- Interactive mode
- Config files
- Cache discovered endpoints
- JSON output mode
- Tests
