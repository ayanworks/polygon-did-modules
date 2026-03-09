import DidRegistryContract from '@ayanworks/polygon-did-registry-contract'
import type { DIDResolutionResult, DIDResolver } from 'did-resolver'
import { Contract, JsonRpcProvider } from 'ethers'
import { parseDid, validateDid } from './utils/did'

/**
 * Factory function to create a DID Resolver with custom configuration.
 * @param rpcUrl Optional override for the RPC
 * @param contractAddress Optional override for the Registry Address
 */
export function getResolver(rpcUrl?: string, contractAddress?: string): Record<string, DIDResolver> {
  const _rpcUrl = rpcUrl
  const _contractAddress = contractAddress

  // The 'resolve' function now matches the DIDResolver type signature
  async function resolve(did: string): Promise<DIDResolutionResult> {
    const isValidDid = validateDid(did)
    if (!isValidDid) {
      throw new Error('invalid did provided')
    }

    // We use the overrides passed to getResolver, or fallback to parsing the DID string
    const parsedDid = parseDid(did, { rpcUrl: _rpcUrl, contractAddress: _contractAddress })

    // Prioritize: 1. Passed to getResolver -> 2. Parsed from DID -> 3. Defaults
    const activeRpc = _rpcUrl || parsedDid.networkUrl
    const activeContract = _contractAddress || parsedDid.contractAddress

    const provider = new JsonRpcProvider(activeRpc)
    const registry = new Contract(activeContract, DidRegistryContract.abi, provider)

    // Calling smart contract to get DID Document
    const didDocument = await registry.getDIDDoc(parsedDid.didAddress)

    if (!didDocument[0]) {
      return {
        didDocument: null,
        didDocumentMetadata: {},
        didResolutionMetadata: {
          error: `NotFound!`,
          message: `resolver_error: Unable to resolve did '${did}'`,
        },
      }
    }
    const didDocumentJson = JSON.parse(didDocument[0])

    if (!didDocumentJson?.verificationMethod) {
      return {
        didDocument: didDocumentJson,
        didDocumentMetadata: {
          linkedResourceMetadata: [],
          deactivated: true,
        },
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
      }
    }
    return {
      didDocument: didDocumentJson,
      didDocumentMetadata: {
        linkedResourceMetadata: didDocument[1].map((element: string) => {
          return JSON.parse(element)
        }),
      },
      didResolutionMetadata: { contentType: 'application/did+ld+json' },
    }
  }
  return { polygon: resolve }
}
