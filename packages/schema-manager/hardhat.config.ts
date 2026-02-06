import '@nomicfoundation/hardhat-ethers'
import '@openzeppelin/hardhat-upgrades'
import '@nomicfoundation/hardhat-verify'
import type { HardhatUserConfig } from 'hardhat/config'

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.16',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: {},
    amoy: {
      url: process.env.AMOY_RPCURL || '',
      accounts: process.env.SIGNER_TESTNET ? [`0x${process.env.SIGNER_TESTNET}`] : [],
    },
  },
  etherscan: {
    apiKey: { polygonAmoy: process.env.VERIFICATION_KEY || '' },
  },
}

export default config
