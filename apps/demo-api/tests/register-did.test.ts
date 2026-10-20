import { SigningKey } from 'ethers'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { TEST_DID, TEST_PRIVATE_KEY, TEST_PUBLIC_KEY_BASE58, TEST_TXN_HASH } from './fixtures'

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

vi.mock('../src/logger', () => ({ default: { debug: vi.fn(), error: vi.fn() } }))

import app from '../src/app'

describe('POST /register-did', () => {
  it('registers a supplied DID document and returns the transaction hash', async () => {
    const didDoc = { id: TEST_DID, verificationMethod: [] }
    mocks.create.mockResolvedValue({ did: TEST_DID, txnHash: { hash: TEST_TXN_HASH }, didDoc })

    const res = await request(app).post('/register-did').send({ did: TEST_DID, privateKey: TEST_PRIVATE_KEY, didDoc })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toEqual({ did: TEST_DID, txnHash: TEST_TXN_HASH })
    expect(mocks.registrarConstructor).toHaveBeenCalledWith({
      contractAddress: process.env.POLYGON_CONTRACT_ADDRESS,
      rpcUrl: process.env.POLYGON_RPC_URL,
      signingKey: expect.any(SigningKey),
    })
    expect(mocks.create).toHaveBeenCalledWith(TEST_DID, didDoc)
    // The registrar must receive a document object, never an encoded string.
    expect(typeof mocks.create.mock.calls[0][1]).toBe('object')
  })

  it('builds the DID document from the private key when the caller omits it', async () => {
    mocks.create.mockResolvedValue({ did: TEST_DID, txnHash: { hash: TEST_TXN_HASH }, didDoc: {} })

    const res = await request(app).post('/register-did').send({ did: TEST_DID, privateKey: TEST_PRIVATE_KEY })

    expect(res.status).toBe(201)
    const [, document] = mocks.create.mock.calls[0]
    expect(document.id).toBe(TEST_DID)
    expect(document.verificationMethod).toHaveLength(1)
    expect(document.verificationMethod[0].publicKeyBase58).toBe(TEST_PUBLIC_KEY_BASE58)
  })

  it('parses a JSON encoded document instead of passing it through encoded', async () => {
    const didDoc = { id: TEST_DID, verificationMethod: [] }
    mocks.create.mockResolvedValue({ did: TEST_DID, txnHash: { hash: TEST_TXN_HASH }, didDoc })

    const res = await request(app)
      .post('/register-did')
      .send({ did: TEST_DID, privateKey: TEST_PRIVATE_KEY, didDoc: JSON.stringify(didDoc) })

    expect(res.status).toBe(201)
    expect(mocks.create).toHaveBeenCalledWith(TEST_DID, didDoc)
  })

  it('accepts a private key without the 0x prefix', async () => {
    mocks.create.mockResolvedValue({ did: TEST_DID, txnHash: { hash: TEST_TXN_HASH }, didDoc: {} })

    const res = await request(app)
      .post('/register-did')
      .send({ did: TEST_DID, privateKey: TEST_PRIVATE_KEY.slice(2) })

    expect(res.status).toBe(201)
    expect(mocks.registrarConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ signingKey: expect.any(SigningKey) })
    )
  })

  it('rejects a request without a DID', async () => {
    const res = await request(app).post('/register-did').send({ privateKey: TEST_PRIVATE_KEY })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, message: 'did is required' })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('rejects a request without a private key', async () => {
    const res = await request(app).post('/register-did').send({ did: TEST_DID })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, message: 'privateKey is required' })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('maps registrar failures to a 500 error payload', async () => {
    mocks.create.mockRejectedValue(new Error('The DID document already registered!'))

    const res = await request(app).post('/register-did').send({ did: TEST_DID, privateKey: TEST_PRIVATE_KEY })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, message: 'The DID document already registered!' })
  })

  it('rejects a malformed JSON document with a 500 error payload', async () => {
    const res = await request(app)
      .post('/register-did')
      .send({ did: TEST_DID, privateKey: TEST_PRIVATE_KEY, didDoc: '{not-json' })

    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
