import { Resolver } from 'did-resolver'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDIDDoc: vi.fn(),
  providerUrls: [] as string[],
  contracts: [] as string[],
}))

// The resolver talks to the registry through ethers; mocking it keeps these
// tests deterministic and proves the did-resolver v6 integration without an RPC.
vi.mock('ethers', () => ({
  JsonRpcProvider: class {
    public constructor(public readonly url: string) {
      mocks.providerUrls.push(url)
    }
  },
  Contract: class {
    public constructor(
      public readonly address: string,
      _abi: unknown,
      _provider: unknown
    ) {
      mocks.contracts.push(address)
    }

    public getDIDDoc(didAddress: string) {
      return mocks.getDIDDoc(didAddress)
    }
  },
}))

import { getResolver } from '../src'

const validDid = 'did:polygon:testnet:0x138d2231e4362fc0e028576Fb2DF56904bd59C1b'
const overrideContract = '0x0000000000000000000000000000000000000001'
const overrideRpc = 'https://rpc.example.test'

const didDocument = {
  '@context': 'https://w3id.org/did/v1',
  id: validDid,
  verificationMethod: [
    {
      id: `${validDid}#key-1`,
      type: 'EcdsaSecp256k1VerificationKey2019',
      controller: validDid,
      publicKeyBase58: 'NDaEdTguJV39Ns8BZkxQ3XR6GUinZAJfVoyEMkK9fP7XQmpSkT3UsLHB52cFpDqoM6m4Hevtba8pkmjvEG3Ur7ji',
    },
  ],
}

const linkedResource = {
  resourceURI: `${validDid};resource=1`,
  resourceCollectionId: validDid,
  resourceId: '1',
  resourceName: 'schema',
  resourceType: 'W3C-schema',
  mediaType: 'application/json',
  created: '2026-01-01T00:00:00Z',
  checksum: 'abc',
  previousVersionId: null,
  nextVersionId: null,
}

describe('polygon-did-resolver / did-resolver v6 integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.providerUrls.length = 0
    mocks.contracts.length = 0
  })

  it('exposes a registry the v6 Resolver can consume', () => {
    const registry = getResolver()

    expect(Object.keys(registry)).toEqual(['polygon'])
    expect(typeof registry.polygon).toBe('function')
  })

  it('resolves a DID into a DIDResolutionResult', async () => {
    mocks.getDIDDoc.mockResolvedValue([JSON.stringify(didDocument), [JSON.stringify(linkedResource)]])

    const result = await new Resolver(getResolver()).resolve(validDid)

    expect(result.didDocument).toEqual(didDocument)
    expect(result.didDocumentMetadata.linkedResourceMetadata).toEqual([linkedResource])
    expect(result.didResolutionMetadata.contentType).toBe('application/did+ld+json')
    expect(mocks.getDIDDoc).toHaveBeenCalledWith('0x138d2231e4362fc0e028576Fb2DF56904bd59C1b')
  })

  it('returns a notFound result when the registry has no document', async () => {
    mocks.getDIDDoc.mockResolvedValue(['', []])

    const result = await new Resolver(getResolver()).resolve(validDid)

    expect(result.didDocument).toBeNull()
    expect(result.didResolutionMetadata.error).toContain('NotFound')
  })

  it('flags a document without verificationMethod as deactivated', async () => {
    mocks.getDIDDoc.mockResolvedValue([JSON.stringify({ id: validDid }), []])

    const result = await new Resolver(getResolver()).resolve(validDid)

    expect(result.didDocumentMetadata.deactivated).toBe(true)
    expect(result.didResolutionMetadata.contentType).toBe('application/did+ld+json')
  })

  it('uses the rpcUrl and contractAddress overrides', async () => {
    mocks.getDIDDoc.mockResolvedValue(['', []])

    await new Resolver(getResolver(overrideRpc, overrideContract)).resolve(validDid)

    expect(mocks.providerUrls[mocks.providerUrls.length - 1]).toBe(overrideRpc)
    expect(mocks.contracts[mocks.contracts.length - 1]).toBe(overrideContract)
  })

  // v6 parses DID URLs strictly according to DID Core: a syntactically invalid
  // DID is reported as an error result rather than thrown, and the chain must
  // never be touched for one.
  it.each([
    ['a matrix parameter', `${validDid};service=agent`],
    ['a truncated method name', 'did::testnet:0x138d2231e4362fc0e028576Fb2DF56904bd59C1b'],
  ])('reports invalidDid for %s without touching the chain', async (_label, did) => {
    const result = await new Resolver(getResolver()).resolve(did)

    expect(result.didDocument).toBeNull()
    expect(result.didResolutionMetadata.error).toBe('invalidDid')
    expect(mocks.providerUrls).toHaveLength(0)
    expect(mocks.getDIDDoc).not.toHaveBeenCalled()
  })

  it('propagates the resolver rejection for a well-formed but non-polygon id', async () => {
    // v6 hands the method-specific id to the resolver, which validates the
    // address; the thrown error is not swallowed by Resolver.
    await expect(new Resolver(getResolver()).resolve('did:polygon:testnet:0x1234')).rejects.toThrow(
      'invalid did provided'
    )
    expect(mocks.getDIDDoc).not.toHaveBeenCalled()
  })

  it('reports unsupportedDidMethod for a DID outside the registry', async () => {
    const result = await new Resolver(getResolver()).resolve(
      'did:example:testnet:0x138d2231e4362fc0e028576Fb2DF56904bd59C1b'
    )

    expect(result.didDocument).toBeNull()
    expect(result.didResolutionMetadata.error).toBe('unsupportedDidMethod')
    expect(mocks.providerUrls).toHaveLength(0)
  })

  // DID URL path/query/fragment components address a resource or verification
  // method inside the document, so resolution targets the base DID.
  it.each([
    ['a path', `${validDid}/path`],
    ['a query', `${validDid}?service=agent`],
    ['a fragment', `${validDid}#key-1`],
  ])('resolves the base DID for a DID URL with %s', async (_label, didUrl) => {
    mocks.getDIDDoc.mockResolvedValue([JSON.stringify(didDocument), []])

    const result = await new Resolver(getResolver()).resolve(didUrl)

    expect(result.didDocument).toEqual(didDocument)
    expect(mocks.getDIDDoc).toHaveBeenCalledWith('0x138d2231e4362fc0e028576Fb2DF56904bd59C1b')
  })
})
