import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import {
  buildSignedRegistryTx,
  createDidCalldata,
  TEST_ADDRESS,
  TEST_CHAIN_ID,
  TEST_DID,
  TEST_PRIVATE_KEY,
  TEST_PUBLIC_KEY_BASE58,
  TEST_TXN_HASH,
} from './fixtures'

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

const INTENT_DID = 'did:polygon:testnet:0x5555555555555555555555555555555555555555'

describe('route table', () => {
  it('serves the six supported endpoints with their success status codes', async () => {
    mocks.createKeyPair.mockReturnValue({
      address: '0x4487cB2567De2Ca6dc5F79A7f6ae944522C4b698',
      privateKey: TEST_PRIVATE_KEY,
      publicKeyBase58: TEST_PUBLIC_KEY_BASE58,
      did: TEST_DID,
    })
    mocks.create.mockResolvedValue({ did: TEST_DID, txnHash: { hash: TEST_TXN_HASH }, didDoc: {} })
    mocks.update.mockResolvedValue({ did: TEST_DID, txnHash: { hash: TEST_TXN_HASH } })
    mocks.resolve.mockResolvedValue({
      didDocument: { id: TEST_DID },
      didDocumentMetadata: {},
      didResolutionMetadata: { contentType: 'application/did+ld+json' },
    })
    mocks.getNetwork.mockResolvedValue({ chainId: BigInt(TEST_CHAIN_ID) })
    mocks.getTransactionCount.mockResolvedValue(0)
    mocks.getFeeData.mockResolvedValue({ maxFeePerGas: 100_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n })
    mocks.estimateGas.mockResolvedValue(300_000n)
    mocks.broadcastTransaction.mockResolvedValue({ hash: TEST_TXN_HASH })

    const create = await request(app).post('/create-did').send({ networkType: 'testnet' })
    expect(create.status).toBe(201)

    const register = await request(app).post('/register-did').send({ did: TEST_DID, privateKey: TEST_PRIVATE_KEY })
    expect(register.status).toBe(201)

    const resolve = await request(app).get(`/resolve-did/${TEST_DID}`)
    expect(resolve.status).toBe(200)

    const update = await request(app)
      .patch(`/update-did/${TEST_DID}`)
      .send({ privateKey: TEST_PRIVATE_KEY, didDoc: { id: TEST_DID } })
    expect(update.status).toBe(200)

    // Keyless flow: an unregistered DID yields a create intent (200, no key involved) ...
    mocks.resolve.mockResolvedValue({ didDocument: null, didDocumentMetadata: {}, didResolutionMetadata: {} })
    const intent = await request(app)
      .post('/tx-intent')
      .send({ operation: 'create', did: INTENT_DID, didDoc: { id: INTENT_DID } })
    expect(intent.status).toBe(200)

    // ... and a locally signed transaction is relayed (201).
    const signedTx = await buildSignedRegistryTx({
      to: process.env.POLYGON_CONTRACT_ADDRESS as string,
      data: createDidCalldata(TEST_ADDRESS, { id: TEST_DID }),
    })
    const broadcast = await request(app).post('/broadcast').send({ signedTx })
    expect(broadcast.status).toBe(201)
  })

  it('no longer exposes the removed delete endpoint', async () => {
    const res = await request(app).delete(`/delete-did/${TEST_DID}/${TEST_PRIVATE_KEY}`)
    expect(res.status).toBe(404)
  })

  it('returns 404 for unknown routes, unsupported methods and the retired key-in-URL update route', async () => {
    expect((await request(app).get('/not-a-route')).status).toBe(404)
    expect((await request(app).get('/create-did')).status).toBe(404)
    expect((await request(app).delete('/register-did')).status).toBe(404)
    expect((await request(app).patch(`/update-did/${TEST_DID}/${TEST_PRIVATE_KEY}`)).status).toBe(404)
  })
})
