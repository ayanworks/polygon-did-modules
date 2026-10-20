import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { TEST_DID } from './fixtures'

const mocks = vi.hoisted(() => ({
  createKeyPair: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  registrarConstructor: vi.fn(),
  getResolver: vi.fn(),
  resolve: vi.fn(),
}))

vi.mock('@ayanworks/polygon-did-registrar', () => {
  class PolygonDID {
    public constructor(options: unknown) {
      mocks.registrarConstructor(options)
    }
    public static createKeyPair(network: string) {
      return mocks.createKeyPair(network)
    }
    public async create(did: string, didDoc: Record<string, unknown>) {
      return mocks.create(did, didDoc)
    }
    public async update(did: string, didDoc: Record<string, unknown>) {
      return mocks.update(did, didDoc)
    }
  }
  return { PolygonDID }
})

vi.mock('@ayanworks/polygon-did-resolver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ayanworks/polygon-did-resolver')>()
  return {
    ...actual,
    getResolver: (rpcUrl?: string, contractAddress?: string) => {
      mocks.getResolver(rpcUrl, contractAddress)
      return { polygon: (did: string) => mocks.resolve(did) }
    },
  }
})

vi.mock('../src/logger', () => ({ default: { debug: vi.fn(), error: vi.fn() } }))

import app from '../src/app'
import { ResolveDid } from '../src/routes/resolve-did'

const OTHER_DID = 'did:polygon:testnet:0x138d2231e4362fc0e028576Fb2DF56904bd59C1b'

describe('GET /resolve-did/:did', () => {
  it('initialises the resolver with the configured RPC and contract', () => {
    // The app singleton is constructed at import time, before mocks are reset,
    // so the wiring is asserted on a fresh instance here.
    const resolveDid = new ResolveDid()

    expect(resolveDid.resolver).toBeDefined()
    expect(mocks.getResolver).toHaveBeenCalledTimes(1)
    expect(mocks.getResolver).toHaveBeenCalledWith(process.env.POLYGON_RPC_URL, process.env.POLYGON_CONTRACT_ADDRESS)
  })

  it('responds with the resolved DID document only', async () => {
    const didDocument = { '@context': 'https://w3id.org/did/v1', id: TEST_DID, verificationMethod: [] }
    mocks.resolve.mockResolvedValue({
      didDocument,
      didDocumentMetadata: {},
      didResolutionMetadata: { contentType: 'application/did+ld+json' },
    })

    const res = await request(app).get(`/resolve-did/${TEST_DID}`)

    expect(res.status).toBe(200)
    // Only the document is exposed - the full resolution result stays internal.
    expect(res.body).toEqual(didDocument)
    expect(res.body.didResolutionMetadata).toBeUndefined()
    expect(mocks.resolve).toHaveBeenCalledWith(TEST_DID)
  })

  it('returns an empty 200 response when no document is found for a valid DID', async () => {
    mocks.resolve.mockResolvedValue({
      didDocument: null,
      didDocumentMetadata: {},
      didResolutionMetadata: { error: 'notFound' },
    })

    const res = await request(app).get(`/resolve-did/${OTHER_DID}`)

    // Preserves the legacy contract: an unresolvable DID yields an empty 200 body.
    expect(res.status).toBe(200)
    expect(res.text).toBe('')
  })

  it('maps resolver failures to a 500 error payload', async () => {
    mocks.resolve.mockRejectedValue(new Error('rpc unreachable'))

    const res = await request(app).get(`/resolve-did/${OTHER_DID}`)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, message: 'rpc unreachable' })
  })
})
