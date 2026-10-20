import { SigningKey } from 'ethers'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { TEST_DID, TEST_PRIVATE_KEY, TEST_TXN_HASH } from './fixtures'

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

describe('PATCH /update-did/:did', () => {
  it('updates the DID document exactly as supplied by the caller', async () => {
    const didDoc = { id: TEST_DID, verificationMethod: [{ id: `${TEST_DID}#key-1` }] }
    mocks.update.mockResolvedValue({ did: TEST_DID, txnHash: { hash: TEST_TXN_HASH } })

    const res = await request(app).patch(`/update-did/${TEST_DID}`).send({ privateKey: TEST_PRIVATE_KEY, didDoc })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: true,
      message: 'DID document updated successfully',
      data: { did: TEST_DID, txnHash: TEST_TXN_HASH },
    })
    expect(mocks.update).toHaveBeenCalledWith(TEST_DID, didDoc)
    // Regression guard: the document must never be (double) encoded before it reaches the registrar.
    expect(typeof mocks.update.mock.calls[0][1]).toBe('object')
    expect(mocks.update.mock.calls[0][1]).not.toBe(JSON.stringify(didDoc))
  })

  it('parses a JSON encoded document exactly once', async () => {
    const didDoc = { id: TEST_DID, verificationMethod: [] }
    mocks.update.mockResolvedValue({ did: TEST_DID, txnHash: { hash: TEST_TXN_HASH } })

    const res = await request(app)
      .patch(`/update-did/${TEST_DID}`)
      .send({ privateKey: TEST_PRIVATE_KEY, didDoc: JSON.stringify(didDoc) })

    expect(res.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(TEST_DID, didDoc)
  })

  it('normalises a body private key without the 0x prefix', async () => {
    mocks.update.mockResolvedValue({ did: TEST_DID, txnHash: { hash: TEST_TXN_HASH } })

    const res = await request(app)
      .patch(`/update-did/${TEST_DID}`)
      .send({ privateKey: TEST_PRIVATE_KEY.slice(2), didDoc: { id: TEST_DID } })

    expect(res.status).toBe(200)
    expect(mocks.registrarConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        contractAddress: process.env.POLYGON_CONTRACT_ADDRESS,
        rpcUrl: process.env.POLYGON_RPC_URL,
        signingKey: expect.any(SigningKey),
      })
    )
  })

  it('no longer accepts the private key in the URL', async () => {
    const res = await request(app)
      .patch(`/update-did/${TEST_DID}/${TEST_PRIVATE_KEY}`)
      .send({ didDoc: { id: TEST_DID } })

    expect(res.status).toBe(404)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects a request without a private key', async () => {
    const res = await request(app)
      .patch(`/update-did/${TEST_DID}`)
      .send({ didDoc: { id: TEST_DID } })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, message: 'privateKey is required' })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects a request without a document', async () => {
    const res = await request(app).patch(`/update-did/${TEST_DID}`).send({ privateKey: TEST_PRIVATE_KEY })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, message: 'didDoc is required' })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('maps registrar failures to a 500 error payload', async () => {
    mocks.update.mockRejectedValue(new Error('The DID document for the given DID was not found!'))

    const res = await request(app)
      .patch(`/update-did/${TEST_DID}`)
      .send({ privateKey: TEST_PRIVATE_KEY, didDoc: { id: TEST_DID } })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, message: 'The DID document for the given DID was not found!' })
  })
})
