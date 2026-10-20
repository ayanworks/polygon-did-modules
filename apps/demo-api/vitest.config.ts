import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    mockReset: true,
    // Deterministic configuration for route tests - no request should ever reach a real RPC.
    env: {
      POLYGON_RPC_URL: 'https://polygon-amoy-bor-rpc.publicnode.com',
      POLYGON_CONTRACT_ADDRESS: '0xcB80F37eDD2bE3570c6C9D5B0888614E04E1e49E',
    },
  },
})
