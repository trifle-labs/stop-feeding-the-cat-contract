[![codecov](https://codecov.io/gh/trifle-labs/stop-feeding-the-cat-contract/graph/badge.svg)](https://codecov.io/gh/trifle-labs/stop-feeding-the-cat-contract)
[![Test Suite](https://github.com/trifle-labs/stop-feeding-the-cat-contract/actions/workflows/test.yml/badge.svg)](https://github.com/trifle-labs/stop-feeding-the-cat-contract/actions/workflows/test.yml)

# Stop Feeding The Cat

A blockchain-based game where players compete to be the last one to feed the cat and win the prize pool.

## Game Mechanics

- 13 different items can be fed to the cat (priced $1-$13 in USDC)
- When you feed the cat, a 24-hour timer starts
- If the timer reaches 0, you win the entire prize pool
- Other players can feed the cat to reset the timer and become the new potential winner
- If the same player feeds multiple items, the timer is reduced (max 23 hours reduction)

## Contract Features

- EIP-1967 upgradeable smart contract
- ERC-1155 NFT items that are minted and burned when fed
- Configurable admin fee percentage
- Pausable for emergency situations
- Automatic round management

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

3. Compile contracts:

```bash
npm run compile
```

## Deployment

### Local Network

```bash
# Start local node
npm run chain

# Deploy in another terminal
npm run deploy:local
```

### Base Sepolia

```bash
npm run deploy:baseSepolia
npm run verify:baseSepolia
```

### Base Mainnet

```bash
npm run deploy:base
npm run verify:base
```

## Testing

Run the test suite:

```bash
npm test
```

### Test Coverage

Generate coverage reports:

```bash
# Full coverage report
npm run coverage

# V1 contract only
npm run coverage:v1

# V2 contract only
npm run coverage:v2
```

Coverage reports are generated in multiple formats:

- **HTML**: Open `coverage/index.html` in your browser
- **LCOV**: For CI/CD integration (`coverage/lcov.info`)
- **JSON**: Machine-readable format (`coverage.json`)

Current coverage:

- **Statements**: 96.81%
- **Branches**: 69.57%
- **Functions**: 100%
- **Lines**: 96.06%

## Upgrading to V2

The contract supports safe upgrades using OpenZeppelin's UUPS pattern.

### V2 Features

- **Emergency Pause**: Additional pause mechanism independent of regular pause/unpause
- **Enhanced Safety**: Owner can immediately halt all game operations if needed
- **State Preservation**: Emergency pause doesn't affect ongoing rounds, just blocks new actions

### Upgrade Process

1. **Prepare the upgrade** (validates compatibility):

```bash
# Check upgrade compatibility
npm run prepare-upgrade:baseSepolia 2
```

2. **Perform the upgrade**:

```bash
# Upgrade to V2
npm run upgrade:baseSepolia 2
```

3. **Verify the upgrade**:

```bash
npm run verify:baseSepolia
```

### Future Versions

To add new versions, follow the pattern in `scripts/upgrade.ts` and create new contracts like `StopFeedingTheCatV3.sol`. The upgrade system is designed to handle multiple versions automatically.

## Using as NPM Package

After deployment, build the package:

```bash
npm run build
```

Then in another project:

```javascript
import { StopFeedingTheCat } from '@trifle/stop-feeding-the-cat';

const contractAddress = StopFeedingTheCat.networks[chainId].address;
const abi = StopFeedingTheCat.abi;
```

## Network Information

- **Base Sepolia**: Chain ID 84532
- **Base Mainnet**: Chain ID 8453

## USDC Addresses

- **Base Sepolia**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **Base Mainnet**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
