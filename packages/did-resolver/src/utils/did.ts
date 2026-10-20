import { networkConfig } from '../config'

export const POLYGON_DID_REGEX = new RegExp(/^did:polygon(:testnet)?:0x[0-9a-fA-F]{40}$/)

/**
 * Reads the network segment of a DID.
 *
 * Anything that is not exactly `testnet` used to be treated as mainnet, so a
 * malformed string was quietly resolved against the mainnet registry instead of
 * being rejected. Unknown input now throws.
 */
export function getNetworkFromDid(did: string) {
  const segments = typeof did === 'string' ? did.split(':') : []
  // did:polygon:<address> (mainnet) or did:polygon:testnet:<address> (testnet)
  const network = segments[2]
  if (network === 'testnet') {
    return 'testnet'
  }
  if (network?.startsWith('0x')) {
    return 'mainnet'
  }

  throw new Error('invalid did provided')
}

export function parseDid(did: string, options: { rpcUrl?: string; contractAddress?: string } = {}) {
  // Reject malformed DIDs here too. This used to return a mainnet network,
  // contract address and `didAddress: undefined` for any string that was not
  // recognised, which is a dangerous default for a value that decides where a
  // write is sent.
  if (!validateDid(did)) {
    throw new Error('invalid did provided')
  }

  const network = getNetworkFromDid(did)
  const didAddress = network === 'testnet' ? did.split(':')[3] : did.split(':')[2]
  const contractAddress = options?.contractAddress ?? networkConfig[network].CONTRACT_ADDRESS
  const networkUrl = options?.rpcUrl ?? networkConfig[network].URL

  return {
    network,
    contractAddress,
    networkUrl,
    didAddress,
  }
}

export function validateDid(did: string) {
  return typeof did === 'string' && POLYGON_DID_REGEX.test(did)
}

export function getDidFromAddress(address: string, network: string) {
  if (network === 'testnet') {
    return `did:polygon:testnet:${address}`
  }

  return `did:polygon:${address}`
}
