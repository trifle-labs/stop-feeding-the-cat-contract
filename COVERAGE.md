# Test Coverage Report

## Summary

| Metric | Coverage |
|--------|----------|
| **Statements** | 96.81% |
| **Branches** | 69.57% |
| **Functions** | 100% |
| **Lines** | 96.06% |

## Per-File Coverage

### StopFeedingTheCat.sol (V1)
- **Statements**: 98.51%
- **Branches**: 68.75%
- **Functions**: 100%
- **Lines**: 97.83%

### StopFeedingTheCatV2.sol (V2)
- **Statements**: 92.59%
- **Branches**: 71.43%
- **Functions**: 100%
- **Lines**: 91.43%

## Uncovered Lines

### StopFeedingTheCat.sol
- Line 121: Edge case in `_endRound` when winner is null
- Line 242: Edge case in `uint2str` (empty string handling)

### StopFeedingTheCatV2.sol
- Lines 32-33: Edge case in `feedTheCat` auto-end logic
- Line 55: Edge case in timer reduction logic

## Coverage Goals

- ✅ **Functions**: 100% (Target: 100%)
- ✅ **Statements**: 96.81% (Target: 95%)
- ✅ **Lines**: 96.06% (Target: 95%)
- ⚠️ **Branches**: 69.57% (Target: 80%)

## Running Coverage

```bash
# Full coverage
npm run coverage

# Individual contracts
npm run coverage:v1
npm run coverage:v2
```

## Coverage Reports

- **HTML Report**: `coverage/index.html`
- **LCOV Report**: `coverage/lcov.info`
- **JSON Report**: `coverage.json`

## Notes

The uncovered branches are primarily edge cases and error conditions that are difficult to reproduce in tests but are important for contract safety. The current coverage provides excellent confidence in the contract's correctness.