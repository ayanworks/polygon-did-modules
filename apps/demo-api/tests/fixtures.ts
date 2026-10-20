import DidRegistryContract from '@ayanworks/polygon-did-registry-contract'
import { Interface, Wallet } from 'ethers'

export const TEST_PRIVATE_KEY = '0x6320c5bcc5edfb1f3324b94a67c0e69916d828d6374ddb1dfeae92c27e3098de'
export const TEST_ADDRESS = '0x4487cB2567De2Ca6dc5F79A7f6ae944522C4b698'
export const TEST_DID = `did:polygon:testnet:${TEST_ADDRESS}`
export const TEST_PUBLIC_KEY_BASE58 =
  '7Lnm1fsBFK3CYs28pDnfQiUaxFSSaiSBLbaZesn62WEQRryi4ezgRXPSDaT2yRBDzzCFFLBeZCnCzz7J5KyFTXGyyxhMz'
export const TEST_TXN_HASH = '0x9f2c1a7e5b3d8a4f6c0e2b9d7a1f3c5e8b6d4a2f9c7e1b3d5a8f6c4e2b0d9a7f'

const registryInterface = new Interface(DidRegistryContract.abi)

export const CREATE_DID_SELECTOR = registryInterface.getFunction('createDID')?.selector ?? ''
export const UPDATE_DID_DOC_SELECTOR = registryInterface.getFunction('updateDIDDoc')?.selector ?? ''

export const TEST_CHAIN_ID = 80002

export const createDidCalldata = (address: string, document: unknown): string =>
  registryInterface.encodeFunctionData('createDID', [address, JSON.stringify(document)])

export const updateDidDocCalldata = (address: string, document: unknown): string =>
  registryInterface.encodeFunctionData('updateDIDDoc', [address, JSON.stringify(document)])

/**
 * Signs a registry transaction locally, exactly like a caller of the keyless
 * flow would before posting it to /broadcast.
 */
export const buildSignedRegistryTx = async (options: {
  to: string
  data: string
  privateKey?: string
  value?: bigint
}): Promise<string> => {
  const wallet = new Wallet(options.privateKey ?? TEST_PRIVATE_KEY)
  return wallet.signTransaction({
    to: options.to,
    data: options.data,
    value: options.value ?? 0,
    nonce: 0,
    chainId: TEST_CHAIN_ID,
    gasLimit: 500_000,
    maxFeePerGas: 100_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
  })
}
