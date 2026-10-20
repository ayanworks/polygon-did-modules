export type AppConfig = {
  port: string
  rpcUrl: string
  contractAddress: string
}

// Defaults mirror the testnet configuration of @ayanworks/polygon-did-resolver.
// Override via environment when targeting another network or deployment.
const DEFAULT_TESTNET_RPC_URL = 'https://polygon-amoy-bor-rpc.publicnode.com'
const DEFAULT_TESTNET_CONTRACT_ADDRESS = '0xcB80F37eDD2bE3570c6C9D5B0888614E04E1e49E'

export const config: AppConfig = {
  port: process.env.PORT ?? '8081',
  rpcUrl: process.env.POLYGON_RPC_URL ?? DEFAULT_TESTNET_RPC_URL,
  contractAddress: process.env.POLYGON_CONTRACT_ADDRESS ?? DEFAULT_TESTNET_CONTRACT_ADDRESS,
}
