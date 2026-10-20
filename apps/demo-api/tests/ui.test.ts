import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

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
import { TEST_DID } from './fixtures'

describe('playground UI', () => {
  it('serves the playground page at the root', async () => {
    const res = await request(app).get('/')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.text).toContain('Polygon DID Playground')
    // The page loads its own assets rather than inlining everything.
    expect(res.text).toContain('./app.js')
    expect(res.text).toContain('./styles.css')
  })

  it('serves the playground assets', async () => {
    const script = await request(app).get('/app.js')
    expect(script.status).toBe(200)
    expect(script.headers['content-type']).toContain('javascript')

    const styles = await request(app).get('/styles.css')
    expect(styles.status).toBe(200)
    expect(styles.headers['content-type']).toContain('css')
  })

  it('wires every API endpoint into the page', async () => {
    const res = await request(app).get('/app.js')

    // The endpoint catalogue the UI renders and the actions it binds must cover
    // each route the API exposes, so a removed or renamed route fails here.
    for (const route of ['/create-did', '/register-did', '/resolve-did', '/update-did', '/tx-intent', '/broadcast']) {
      expect(res.text).toContain(route)
    }

    // The three signing paths the README documents.
    expect(res.text).toContain('window.ethereum')
    expect(res.text).toContain('signTransaction')
  })

  it('does not reference the removed delete endpoint', async () => {
    const page = await request(app).get('/')
    const script = await request(app).get('/app.js')

    // The page only names /delete-did to document that it no longer exists.
    expect(page.text).not.toContain('/delete-did')
    expect(script.text).toContain('Removed')
  })

  it('ships the keyless step elements the script drives', async () => {
    const page = await request(app).get('/')

    // app.js looks these up by id; without them the flow silently breaks.
    for (const id of ['step-intent', 'step-sign', 'step-broadcast', 'step-verify']) {
      expect(page.text).toContain(`id="${id}"`)
    }
  })

  it('defers endpoint body prefilling, so an identity is not required at render time', async () => {
    const script = await request(app).get('/app.js')

    // The endpoint bodies embed the DID document. Rendering them may not throw
    // when no identity exists yet, and the identity must be generated first.
    const wireBody = script.text.slice(script.text.indexOf('const wire = () =>'))
    expect(wireBody.indexOf('generateIdentity()')).toBeLessThan(wireBody.indexOf('renderEndpoints()'))
  })

  it('reports the configured network without leaking anything sensitive', async () => {
    const res = await request(app).get('/config')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.rpcUrl).toBe(process.env.POLYGON_RPC_URL as string)
    expect(res.body.data.contractAddress).toBe(process.env.POLYGON_CONTRACT_ADDRESS as string)
    expect(JSON.stringify(res.body)).not.toContain('privateKey')
  })

  it('still returns JSON and swagger for the API surface, not the page', async () => {
    mocks.resolve.mockResolvedValue({
      didDocument: { id: TEST_DID },
      didDocumentMetadata: {},
      didResolutionMetadata: {},
    })

    const resolve = await request(app).get(`/resolve-did/${TEST_DID}`)
    expect(resolve.status).toBe(200)
    expect(resolve.headers['content-type']).toContain('application/json')

    const swagger = await request(app).get('/index/')
    expect(swagger.status).toBe(200)
    expect(swagger.text).toContain('swagger-ui-init.js')
  })

  it('keeps unknown paths as 404s rather than serving the page', async () => {
    const res = await request(app).get('/not-a-route')

    expect(res.status).toBe(404)
    expect(res.text).not.toContain('Polygon DID Playground')
  })

  it('routes every request through the configurable API base', async () => {
    const page = await request(app).get('/')
    const script = await request(app).get('/app.js')

    // Empty by default, which keeps the page same-origin when the API serves it.
    expect(page.text).toContain('<meta name="api-base" content="">')

    // A split deployment (static UI, API elsewhere) only works if nothing calls
    // a relative path directly - that would hit the UI's host instead. Assert
    // the property rather than a pattern: every fetch must go through apiUrl().
    expect(script.text).toContain('apiUrl(')
    const fetches = script.text.match(/fetch\([^)]*/g) ?? []
    expect(fetches.length).toBeGreaterThan(0)
    for (const call of fetches) {
      expect(call).toContain('apiUrl(')
    }
  })

  it('carries the AYANWORKS branding', async () => {
    const page = await request(app).get('/')
    const styles = await request(app).get('/styles.css')

    // The lockup is served from our own origin, so the page has no dependency
    // on ayanworks.com at runtime.
    expect(page.text).toContain('./assets/ayanworks-logo.svg')
    expect(page.text).toContain('favicon.ico')
    expect(page.text).toContain('AYANWORKS')

    const logo = await request(app).get('/assets/ayanworks-logo.svg')
    expect(logo.status).toBe(200)
    expect(logo.headers['content-type']).toContain('svg')

    const favicon = await request(app).get('/favicon.ico')
    expect(favicon.status).toBe(200)

    // The navy surface and sovereign gold accent, straight from ayanworks.com.
    expect(styles.text).toContain('--bg: #0a1628')
    expect(styles.text).toContain('--accent: #c8903f')
  })
})
