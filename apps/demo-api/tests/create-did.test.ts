import { computeAddress } from 'ethers'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { TEST_DID, TEST_PRIVATE_KEY, TEST_PUBLIC_KEY_BASE58 } from './fixtures'

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

describe('POST /create-did', () => {
  it('generates a key pair and DID document locally without touching the chain', async () => {
    mocks.createKeyPair.mockReturnValue({
      address: '0x4487cB2567De2Ca6dc5F79A7f6ae944522C4b698',
      privateKey: TEST_PRIVATE_KEY,
      publicKeyBase58: TEST_PUBLIC_KEY_BASE58,
      did: TEST_DID,
    })

    const res = await request(app).post('/create-did').send({ networkType: 'testnet' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(mocks.createKeyPair).toHaveBeenCalledWith('testnet')
    expect(res.body.data.did).toBe(TEST_DID)
    expect(res.body.data.privateKey).toBe(TEST_PRIVATE_KEY)
    expect(res.body.data.didDoc.id).toBe(TEST_DID)
    expect(res.body.data.didDoc.verificationMethod).toHaveLength(1)
    expect(res.body.data.didDoc.verificationMethod[0].publicKeyBase58).toBe(TEST_PUBLIC_KEY_BASE58)
    expect(res.body.data.didDoc.authentication).toEqual([`${TEST_DID}#key-1`])
  })

  it('derives the DID from a supplied private key instead of generating one', async () => {
    const res = await request(app).post('/create-did').send({ networkType: 'testnet', privateKey: TEST_PRIVATE_KEY })

    const address = computeAddress(TEST_PRIVATE_KEY)

    expect(res.status).toBe(201)
    expect(mocks.createKeyPair).not.toHaveBeenCalled()
    expect(res.body.data.address).toBe(address)
    expect(res.body.data.did).toBe(`did:polygon:testnet:${address}`)
    expect(res.body.data.publicKeyBase58).toBeTruthy()
    expect(res.body.data.didDoc.verificationMethod[0].publicKeyBase58).toBe(res.body.data.publicKeyBase58)
  })

  it('accepts a private key without the 0x prefix', async () => {
    const res = await request(app)
      .post('/create-did')
      .send({ networkType: 'testnet', privateKey: TEST_PRIVATE_KEY.slice(2) })

    expect(res.status).toBe(201)
    expect(res.body.data.privateKey).toBe(TEST_PRIVATE_KEY)
  })

  it('builds a mainnet DID without a network segment', async () => {
    const res = await request(app).post('/create-did').send({ networkType: 'mainnet', privateKey: TEST_PRIVATE_KEY })

    expect(res.status).toBe(201)
    expect(res.body.data.did).toBe(`did:polygon:${computeAddress(TEST_PRIVATE_KEY)}`)
  })

  it('rejects an unsupported network type', async () => {
    const res = await request(app).post('/create-did').send({ networkType: 'goerli' })

    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe('Invalid network provided')
  })

  it('maps a missing network type to the same validation error', async () => {
    const res = await request(app).post('/create-did').send({})

    expect(res.status).toBe(500)
    expect(res.body.message).toBe('Invalid network provided')
  })

  it('maps library failures to a 500 error payload', async () => {
    mocks.createKeyPair.mockImplementation(() => {
      throw new Error('key generation failed')
    })

    const res = await request(app).post('/create-did').send({ networkType: 'testnet' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, message: 'key generation failed' })
  })
})
