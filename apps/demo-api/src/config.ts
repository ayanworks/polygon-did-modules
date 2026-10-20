export type AppConfig = {
  port: string
  rpcUrl: string
  contractAddress: string
  schemaManagerContractAddress: string
  serverUrl: string
  fileServerToken: string
}

// Defaults mirror the testnet configuration.
const DEFAULT_TESTNET_RPC_URL = 'https://polygon-amoy-bor-rpc.publicnode.com'
const DEFAULT_TESTNET_CONTRACT_ADDRESS = '0xcB80F37eDD2bE3570c6C9D5B0888614E04E1e49E'
const DEFAULT_TESTNET_SCHEMA_MANAGER_CONTRACT_ADDRESS = '0x4742d43C2dFCa5a1d4238240Afa8547Daf87Ee7a'
const DEFAULT_TESTNET_SERVER_URL = 'https://schema-file-server.polygonid.me'
const DEFAULT_TESTNET_FILE_SERVER_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJBeWFuV29ya3MiLCJpZCI6IjdmYjRmN2I3LWQ5ZWUtNDYxOC04OTE4LWZiMmIzYzY1M2EyYiJ9.x-kHeTVqX4w19ibSAspCYgIL-JFVss8yZ0CT21QVRYM'

export const config: AppConfig = {
  port: process.env.PORT ?? '8081',
  rpcUrl: process.env.POLYGON_RPC_URL ?? DEFAULT_TESTNET_RPC_URL,
  contractAddress: process.env.POLYGON_CONTRACT_ADDRESS ?? DEFAULT_TESTNET_CONTRACT_ADDRESS,
  schemaManagerContractAddress:
    process.env.SCHEMA_MANAGER_CONTRACT_ADDRESS ?? DEFAULT_TESTNET_SCHEMA_MANAGER_CONTRACT_ADDRESS,
  serverUrl: process.env.SCHEMA_SERVER_URL ?? DEFAULT_TESTNET_SERVER_URL,
  fileServerToken: process.env.FILE_SERVER_TOKEN ?? DEFAULT_TESTNET_FILE_SERVER_TOKEN,
}
