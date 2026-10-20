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

describe('application wiring', () => {
  it('redirects /index to the swagger UI', async () => {
    const res = await request(app).get('/index')

    expect(res.status).toBe(301)
    expect(res.headers.location).toBe('/index/')
  })

  it('serves the swagger UI', async () => {
    const res = await request(app).get('/index/')

    expect(res.status).toBe(200)
    expect(res.text).toContain('swagger-ui-init.js')
  })

  it('serves the swagger specification referenced by the UI', async () => {
    const res = await request(app).get('/index/swagger-ui-init.js')

    expect(res.status).toBe(200)
    expect(res.text).toContain('Polygon DID-Method Demo')
    expect(res.text).toContain('/create-did')
    expect(res.text).toContain('/register-did')
    expect(res.text).toContain('/resolve-did/{did}')
    expect(res.text).toContain('/update-did/{did}')
    expect(res.text).toContain('/tx-intent')
    expect(res.text).toContain('/broadcast')
    expect(res.text).toContain('/config')
    // The delete endpoint and the retired key-in-the-URL update route are gone from the contract.
    expect(res.text).not.toContain('/delete-did')
    expect(res.text).not.toContain('/update-did/{did}/{privateKey}')
  })

  it('enables CORS on API responses', async () => {
    mocks.resolve.mockResolvedValue({
      didDocument: { id: TEST_DID },
      didDocumentMetadata: {},
      didResolutionMetadata: { contentType: 'application/did+ld+json' },
    })

    const res = await request(app).get(`/resolve-did/${TEST_DID}`)

    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe('*')
  })

  it('parses JSON request bodies', async () => {
    mocks.createKeyPair.mockReturnValue({
      address: '0x4487cB2567De2Ca6dc5F79A7f6ae944522C4b698',
      privateKey: '0xabc',
      publicKeyBase58: 'base58',
      did: TEST_DID,
    })

    const res = await request(app)
      .post('/create-did')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ networkType: 'testnet' }))

    expect(res.status).toBe(201)
    expect(mocks.createKeyPair).toHaveBeenCalledWith('testnet')
  })
})
