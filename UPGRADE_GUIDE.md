# Upgrade Guide

This guide explains how to safely upgrade the Stop Feeding The Cat smart contract to new versions.

## Overview

The contract uses OpenZeppelin's UUPS (Universal Upgradeable Proxy Standard) pattern, allowing for safe upgrades while preserving state and user funds.

## V2 Features

Version 2 adds the following minimal but important feature:
- **Emergency Pause**: Additional pause mechanism that works independently of the regular pause/unpause functionality
- **Enhanced Safety**: Contract owner can immediately halt all game operations if a critical issue is discovered
- **Non-Disruptive**: Emergency pause doesn't end or interfere with ongoing rounds, it just prevents new actions

## Upgrade Process

### 1. Prepare for Upgrade

First, check the current state and validate the upgrade:

```bash
# For local network
npm run prepare-upgrade:local 2

# For Base Sepolia
npm run prepare-upgrade:baseSepolia 2

# For Base Mainnet
npm run prepare-upgrade:base 2
```

This command will:
- Check storage layout compatibility
- Estimate gas costs
- Show current contract state
- Display new features in the target version

### 2. Perform the Upgrade

Once you're ready, execute the upgrade:

```bash
# For local network
npm run upgrade:local 2

# For Base Sepolia
npm run upgrade:baseSepolia 2

# For Base Mainnet
npm run upgrade:base 2
```

The upgrade script will:
- Validate the upgrade one more time
- Deploy the new implementation
- Call the initializer function (if needed)
- Update the proxy to point to the new implementation
- Verify the upgrade was successful
- Update deployment records

### 3. Verify the Upgrade

After upgrading, verify on Etherscan:

```bash
npm run verify:baseSepolia
# or
npm run verify:base
```

## Adding Future Versions

To add a new version (e.g., V3):

### 1. Create the New Contract

Create `contracts/StopFeedingTheCatV3.sol`:

```solidity
contract StopFeedingTheCatV3 is StopFeedingTheCatV2 {
    uint256 public constant VERSION = 3;
    
    // New state variables...
    
    function initializeV3(/* params */) public reinitializer(3) {
        // Initialize new features...
    }
    
    // New functions...
}
```

### 2. Update Upgrade Script

Edit `scripts/upgrade.ts` and add the new version configuration:

```typescript
const UPGRADE_CONFIGS: { [version: number]: UpgradeConfig } = {
  2: { /* existing V2 config */ },
  3: {
    version: 3,
    contractName: "StopFeedingTheCatV3",
    initializerFunction: "initializeV3",
    initializerArgs: [/* your args */]
  }
};
```

### 3. Test the Upgrade

Create tests in `test/StopFeedingTheCatV3.test.ts` to verify:
- State preservation
- New feature functionality
- Upgrade process

### 4. Deploy

Use the same upgrade commands with version 3:

```bash
npm run prepare-upgrade:local 3
npm run upgrade:local 3
```

## Safety Considerations

### Before Upgrading

1. **Test Thoroughly**: Always test upgrades on testnet first
2. **Backup State**: Consider taking a snapshot of critical state data
3. **Announce to Users**: Give users advance notice of the upgrade
4. **Note on Active Rounds**: While technically safe to upgrade during active rounds, consider timing for best user experience

### Storage Layout

- Never remove or reorder existing state variables
- Only add new state variables at the end
- Use the `__gap` array for future storage reservation
- Run storage layout validation before upgrading

### Emergency Procedures

If an upgrade fails:
1. The proxy remains pointed to the old implementation
2. No state is lost
3. You can retry the upgrade after fixing issues

### Rollback

While not recommended, if critical issues are found post-upgrade:
1. Deploy the previous version as a new implementation
2. Upgrade the proxy to point to it
3. Note: New state variables will remain but won't be used

## Testing Upgrades

Always test the full upgrade process:

```bash
# Run V1 tests
npm test

# Compile all contracts
npm run compile

# Run V2 upgrade tests
npm run test:v2
```

## Monitoring

After upgrading:
1. Monitor contract events
2. Check that rounds are proceeding normally
3. Verify new features are working as expected
4. Monitor gas usage changes

## Support

For issues or questions about upgrades:
- Review OpenZeppelin's upgrade documentation
- Check the contract's GitHub repository
- Test thoroughly on testnet before mainnet upgrades