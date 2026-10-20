import { Transaction } from 'ethers'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { buildSignedRegistryTx, createDidCalldata, TEST_ADDRESS, TEST_DID, TEST_TXN_HASH } from './fixtures'

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

vi.mock('../src/logger', () => ({ default: { debug: vi.fn(), error: vi.fn() } }))

import app from '../src/app'

const CONTRACT = process.env.POLYGON_CONTRACT_ADDRESS as string
const CREATE_DATA = createDidCalldata(TEST_ADDRESS, { id: TEST_DID })

describe('POST /broadcast', () => {
  it('relays a locally signed registry transaction and returns its hash', async () => {
    const signedTx = await buildSignedRegistryTx({ to: CONTRACT, data: CREATE_DATA })
    mocks.broadcastTransaction.mockResolvedValue({ hash: TEST_TXN_HASH })

    const res = await request(app).post('/broadcast').send({ signedTx })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      success: true,
      message: 'Transaction broadcast successfully',
      data: { txnHash: TEST_TXN_HASH },
    })
    expect(mocks.broadcastTransaction).toHaveBeenCalledWith(signedTx)
  })

  it('rejects a missing or non-string payload', async () => {
    const missing = await request(app).post('/broadcast').send({})
    const wrongType = await request(app).post('/broadcast').send({ signedTx: 1234 })

    for (const res of [missing, wrongType]) {
      expect(res.status).toBe(500)
      expect(res.body).toEqual({ success: false, message: 'signedTx is required' })
    }
    expect(mocks.broadcastTransaction).not.toHaveBeenCalled()
  })

  it('rejects a payload that is not a valid transaction', async () => {
    const res = await request(app).post('/broadcast').send({ signedTx: 'not-a-transaction' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, message: 'signedTx is not a valid signed transaction' })
    expect(mocks.broadcastTransaction).not.toHaveBeenCalled()
  })

  it('rejects an unsigned transaction', async () => {
    const unsignedTx = Transaction.from({ to: CONTRACT, data: CREATE_DATA, chainId: 80002 }).unsignedSerialized

    const res = await request(app).post('/broadcast').send({ signedTx: unsignedTx })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, message: 'signedTx must be signed by the DID controller' })
    expect(mocks.broadcastTransaction).not.toHaveBeenCalled()
  })

  it('rejects a signed transaction that targets another contract', async () => {
    const signedTx = await buildSignedRegistryTx({
      to: '0x000000000000000000000000000000000000dEaD',
      data: CREATE_DATA,
    })

    const res = await request(app).post('/broadcast').send({ signedTx })

    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toContain(`must target the DID registry contract at ${CONTRACT}`)
    expect(mocks.broadcastTransaction).not.toHaveBeenCalled()
  })

  it('rejects a signed transaction for an unsupported method', async () => {
    // ERC-20 transfer selector - the relay must not carry arbitrary calldata.
    const transferData = `0xa9059cbb${'0'.repeat(128)}`
    const signedTx = await buildSignedRegistryTx({ to: CONTRACT, data: transferData })

    const res = await request(app).post('/broadcast').send({ signedTx })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, message: 'signed transaction contains an unsupported method' })
    expect(mocks.broadcastTransaction).not.toHaveBeenCalled()
  })

  it('maps node rejections to a 500 error payload', async () => {
    const signedTx = await buildSignedRegistryTx({ to: CONTRACT, data: CREATE_DATA })
    mocks.broadcastTransaction.mockRejectedValue(new Error('insufficient funds for intrinsic transaction cost'))

    const res = await request(app).post('/broadcast').send({ signedTx })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, message: 'insufficient funds for intrinsic transaction cost' })
  })
})
