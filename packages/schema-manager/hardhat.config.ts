import hardhatEthers from '@nomicfoundation/hardhat-ethers'
import hardhatVerify from '@nomicfoundation/hardhat-verify'
import hardhatUpgrades from '@openzeppelin/hardhat-upgrades'
import { configVariable, defineConfig } from 'hardhat/config'

export default defineConfig({
  plugins: [hardhatEthers, hardhatVerify, hardhatUpgrades],
  solidity: {
    version: '0.8.16',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    // `default` is Hardhat's built-in simulated network, so only the live
    // Polygon Amoy network needs to be declared.
    amoy: {
      type: 'http',
      url: configVariable('AMOY_RPCURL'),
      accounts: process.env.SIGNER_TESTNET ? [`0x${process.env.SIGNER_TESTNET}`] : [],
    },
  },
  verify: {
    etherscan: { apiKey: process.env.VERIFICATION_KEY || '' },
  },
})
