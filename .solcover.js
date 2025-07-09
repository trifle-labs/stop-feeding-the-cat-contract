module.exports = {
  skipFiles: [
    'mocks/',
    'test/',
  ],
  mocha: {
    grep: "@skip-on-coverage",
    invert: true,
  },
  providerOptions: {
    mnemonic: process.env.MNEMONIC,
  },
  measureStatementCoverage: true,
  measureFunctionCoverage: true,
  measureBranchCoverage: true,
  measureLineCoverage: true,
};