import { toBeHex } from 'ethers'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDidCalldata, TEST_CHAIN_ID, TEST_DID, updateDidDocCalldata } from './fixtures'

const mocks = vi.hoisted(() => ({
  createKeyPair: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  registrarConstructor: vi.fn(),
  getResolver: vi.fn(),
  resolve: vi.fn(),
  getNetwork: vi.fn(),
  getTransactionCount: vi.fn(),
  getFeeData: vi.fn(),
  estimateGas: vi.fn(),
  broadcastTransaction: vi.fn(),
  jsonRpcProvider: vi.fn(),
}))

vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ethers')>()
  // The provider stub is installed before the app singleton is constructed at
  // import time; mockReset clears call histories but the routes keep the instance.
  // A class keeps the stub constructible (`new JsonRpcProvider()`), which an arrow function is
  // not; the cast bridges vitest's function-typed mockImplementation parameter.
  class ProviderStub {
    public getNetwork = mocks.getNetwork
    public getTransactionCount = mocks.getTransactionCount
    public getFeeData = mocks.getFeeData
    public estimateGas = mocks.estimateGas
    public broadcastTransaction = mocks.broadcastTransaction
  }
  mocks.jsonRpcProvider.mockImplementation(ProviderStub as unknown as () => unknown)
  return { ...actual, JsonRpcProvider: mocks.jsonRpcProvider }
})

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

const CONTRACT = process.env.POLYGON_CONTRACT_ADDRESS as string

// The resolver caches per DID for the lifetime of the app singleton, so every
// test that reaches the resolver uses its own DID.
const CREATE_DID = 'did:polygon:testnet:0x1111111111111111111111111111111111111111'
const UPDATE_DID = 'did:polygon:testnet:0x2222222222222222222222222222222222222222'
const DUPLICATE_DID = 'did:polygon:testnet:0x3333333333333333333333333333333333333333'
const UNKNOWN_DID = 'did:polygon:testnet:0x4444444444444444444444444444444444444444'
const JSON_DOC_DID = 'did:polygon:testnet:0x6666666666666666666666666666666666666666'
const PROVIDER_FAIL_DID = 'did:polygon:testnet:0x7777777777777777777777777777777777777777'

const UNRESOLVED = { didDocument: null, didDocumentMetadata: {}, didResolutionMetadata: { error: 'notFound' } }
const RESOLVED = (did: string) => ({
  didDocument: { id: did },
  didDocumentMetadata: {},
  didResolutionMetadata: { contentType: 'application/did+ld+json' },
})

const DID_DOCUMENT = { id: CREATE_DID, verificationMethod: [] }

describe('POST /tx-intent', () => {
  beforeEach(() => {
    mocks.getNetwork.mockResolvedValue({ chainId: BigInt(TEST_CHAIN_ID) })
    mocks.getTransactionCount.mockResolvedValue(3)
    mocks.getFeeData.mockResolvedValue({ maxFeePerGas: 100_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n })
    mocks.estimateGas.mockResolvedValue(300_000n)
  })

  it('builds an unsigned create transaction without ever seeing a private key', async () => {
    mocks.resolve.mockResolvedValue(UNRESOLVED)

    const res = await request(app)
      .post('/tx-intent')
      .send({ operation: 'create', did: CREATE_DID, didDoc: DID_DOCUMENT })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.operation).toBe('create')
    expect(res.body.data.to).toBe(CONTRACT)
    expect(res.body.data.from.toLowerCase()).toBe(CREATE_DID.slice(-42).toLowerCase())
    expect(res.body.data.data).toBe(createDidCalldata(CREATE_DID.slice(-42), DID_DOCUMENT))
    expect(res.body.data.value).toBe('0x0')
    expect(res.body.data.nonce).toBe(toBeHex(3))
    expect(res.body.data.chainId).toBe(toBeHex(BigInt(TEST_CHAIN_ID)))
    expect(res.body.data.gasLimit).toBe(toBeHex(300_000n))
    expect(res.body.data.maxFeePerGas).toBe(toBeHex(100_000_000_000n))
    expect(res.body.data.maxPriorityFeePerGas).toBe(toBeHex(1_000_000_000n))
    expect(mocks.estimateGas).toHaveBeenCalledWith(expect.objectContaining({ to: CONTRACT }))

    // The keyless flow bypasses the custodial registrar entirely.
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.registrarConstructor).not.toHaveBeenCalled()
  })

  it('builds an unsigned update transaction for a registered DID', async () => {
    mocks.resolve.mockResolvedValue(RESOLVED(UPDATE_DID))
    const didDoc = { id: UPDATE_DID, verificationMethod: [{ id: `${UPDATE_DID}#key-1` }] }

    const res = await request(app).post('/tx-intent').send({ operation: 'update', did: UPDATE_DID, didDoc })

    expect(res.status).toBe(200)
    expect(res.body.data.operation).toBe('update')
    expect(res.body.data.data).toBe(updateDidDocCalldata(UPDATE_DID.slice(-42), didDoc))
  })

  it('refuses a create intent for an already registered DID', async () => {
    mocks.resolve.mockResolvedValue(RESOLVED(DUPLICATE_DID))

    const res = await request(app)
      .post('/tx-intent')
      .send({ operation: 'create', did: DUPLICATE_DID, didDoc: { id: DUPLICATE_DID } })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, message: 'The DID document already registered!' })
  })

  it('refuses an update intent for an unknown DID', async () => {
    mocks.resolve.mockResolvedValue(UNRESOLVED)

    const res = await request(app)
      .post('/tx-intent')
      .send({ operation: 'update', did: UNKNOWN_DID, didDoc: { id: UNKNOWN_DID } })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, message: 'The DID document for the given DID was not found!' })
  })

  it('rejects a missing or unknown operation', async () => {
    const missing = await request(app)
      .post('/tx-intent')
      .send({ did: TEST_DID, didDoc: { id: TEST_DID } })
    const unknown = await request(app)
      .post('/tx-intent')
      .send({ operation: 'delete', did: TEST_DID, didDoc: { id: TEST_DID } })

    for (const res of [missing, unknown]) {
      expect(res.status).toBe(500)
      expect(res.body).toEqual({ success: false, message: 'operation must be either create or update' })
    }
  })

  it('validates the request before touching the chain', async () => {
    const noDid = await request(app).post('/tx-intent').send({ operation: 'create', didDoc: DID_DOCUMENT })
    expect(noDid.status).toBe(500)
    expect(noDid.body).toEqual({ success: false, message: 'did is required' })

    const invalidDid = await request(app)
      .post('/tx-intent')
      .send({ operation: 'create', did: 'not-a-did', didDoc: DID_DOCUMENT })
    expect(invalidDid.status).toBe(500)
    expect(invalidDid.body).toEqual({ success: false, message: 'invalid did provided' })

    const noDoc = await request(app).post('/tx-intent').send({ operation: 'create', did: TEST_DID })
    expect(noDoc.status).toBe(500)
    expect(noDoc.body).toEqual({ success: false, message: 'didDoc is required' })
  })

  it('accepts a JSON encoded document and encodes it exactly once', async () => {
    mocks.resolve.mockResolvedValue(UNRESOLVED)
    const didDoc = { id: JSON_DOC_DID, verificationMethod: [] }

    const res = await request(app)
      .post('/tx-intent')
      .send({ operation: 'create', did: JSON_DOC_DID, didDoc: JSON.stringify(didDoc) })

    expect(res.status).toBe(200)
    expect(res.body.data.data).toBe(createDidCalldata(JSON_DOC_DID.slice(-42), didDoc))
  })

  it('rejects a didDoc that is not valid JSON', async () => {
    const res = await request(app)
      .post('/tx-intent')
      .send({ operation: 'create', did: TEST_DID, didDoc: '{not valid json' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, message: 'didDoc is not valid JSON' })
  })

  it('rejects a JSON scalar instead of treating it as a document', async () => {
    const scalar = await request(app)
      .post('/tx-intent')
      .send({ operation: 'create', did: TEST_DID, didDoc: '"a-string"' })
    const array = await request(app).post('/tx-intent').send({ operation: 'create', did: TEST_DID, didDoc: '[1,2]' })

    for (const res of [scalar, array]) {
      expect(res.status).toBe(500)
      expect(res.body).toEqual({ success: false, message: 'didDoc must be a JSON object' })
    }
  })

  it('treats a doc containing __proto__ and constructor as inert data', async () => {
    // JSON.parse keeps these as own keys and JSON.stringify re-emits them as
    // data, so the payload reaches calldata without touching Object.prototype.
    // Pinned so a future switch to a merge/clone cannot silently introduce it.
    mocks.resolve.mockResolvedValue(UNRESOLVED)
    const protoDid = 'did:polygon:testnet:0x8888888888888888888888888888888888888888'
    const didDoc = { id: protoDid, __proto__: { polluted: true }, constructor: { polluted: true } }

    const res = await request(app).post('/tx-intent').send({ operation: 'create', did: protoDid, didDoc })

    expect(res.status).toBe(200)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('maps provider failures to a 500 error payload', async () => {
    mocks.resolve.mockResolvedValue(UNRESOLVED)
    mocks.getFeeData.mockRejectedValue(new Error('fee data unavailable'))

    const res = await request(app)
      .post('/tx-intent')
      .send({ operation: 'create', did: PROVIDER_FAIL_DID, didDoc: { id: PROVIDER_FAIL_DID } })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, message: 'fee data unavailable' })
  })
})
