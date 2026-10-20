import { SigningKey } from 'ethers'
import { describe, expect, it } from 'vitest'
import { PolygonDID } from '../src/registrar'
import { testContractDetails, testDidDetails } from './fixtures/test.data'
import { buildTestDidDoc } from './utils/array'

const CONTRACT_ADDRESS = testContractDetails.contractAddress
const NETWORK_URL = testContractDetails.networkUrl
const VALID_DID = testDidDetails.did

const validDoc = buildTestDidDoc(VALID_DID, testDidDetails.publicKeyBase58, 'https://example.com')

/**
 * A registrar whose chain access is stubbed out.
 *
 * The guards under test sit in front of the network call, so an unstubbed
 * instance reaches the RPC and the assertions then pass or fail for the wrong
 * reason - a live request is what exposed this while writing the tests.
 */
const buildRegistrar = ({ registered = false }: { registered?: boolean } = {}) => {
  const registrar = new PolygonDID({
    contractAddress: CONTRACT_ADDRESS,
    rpcUrl: NETWORK_URL,
    signingKey: new SigningKey(`0x${testDidDetails.privateKey}`),
  })
  // `registered: false` means "not registered yet" for create; update requires
  // `registered: true` or it stops at the existence check.
  const resolver = { resolve: async () => ({ didDocument: registered ? validDoc : undefined }) }
  const registry = {
    createDID: async () => '0xstub-txn',
    updateDIDDoc: async () => '0xstub-txn',
    addResource: async () => '0xstub-txn',
  }
  Object.assign(registrar, { resolver, registry })
  return registrar
}

/**
 * Regression tests for the argument validation in `PolygonDID`.
 *
 * The guards are the only thing standing between caller input and a signed
 * registry transaction, so the interesting cases are the ones that used to slip
 * through them.
 */
describe('polygon-did-registrar / input validation', () => {
  describe('update', () => {
    // `!didDoc && !JSON.parse(didDoc)` could never fire: `didDoc` is an object,
    // so JSON.parse received "[object Object]" and threw a TypeError instead.
    it('rejects an empty DID document', async () => {
      await expect(buildRegistrar().update(VALID_DID, {} as never)).rejects.toThrow(/valid did document/)
    })

    // Previously failed with an unrelated TypeError from Object.keys(null)
    // rather than a clean validation error.
    it('rejects a null DID document', async () => {
      await expect(buildRegistrar().update(VALID_DID, null as never)).rejects.toThrow(/valid did document/)
    })

    // On the old code this value was never validated at all: it was serialised
    // and signed into a registry transaction that the node then rejected.
    it('rejects a non-object DID document', async () => {
      await expect(buildRegistrar().update(VALID_DID, 'not-a-document' as never)).rejects.toThrow(/valid did document/)
    })

    it('rejects an invalid DID', async () => {
      await expect(buildRegistrar().update('not-a-did', validDoc)).rejects.toThrow(/Invalid did provided/)
      await expect(buildRegistrar().update('', validDoc)).rejects.toThrow(/Invalid did provided/)
    })

    it('accepts a valid DID with a valid document', async () => {
      await expect(buildRegistrar({ registered: true }).update(VALID_DID, validDoc)).resolves.toBeTruthy()
    })
  })

  describe('updateResource', () => {
    // The old guard was `!isValidDid && resourceId`, so an invalid DID was only
    // rejected when a resourceId happened to be present. With an empty
    // resourceId the DID validation was skipped entirely.
    it('rejects an invalid DID even when the resourceId is empty', async () => {
      await expect(buildRegistrar().updateResource('not-a-did', '', {} as never)).rejects.toThrow(
        /Invalid DID provided/
      )
    })

    it('rejects an invalid DID with an undefined resourceId', async () => {
      await expect(buildRegistrar().updateResource('not-a-did', undefined as never, {} as never)).rejects.toThrow(
        /Invalid DID provided/
      )
    })

    it('rejects a missing resourceId for a valid DID', async () => {
      await expect(buildRegistrar().updateResource(VALID_DID, '', {} as never)).rejects.toThrow(
        /Invalid resourceId provided/
      )
    })

    it('rejects an incomplete resource payload for otherwise valid input', async () => {
      await expect(buildRegistrar().updateResource(VALID_DID, 'resource-1', {} as never)).rejects.toThrow(
        /Required fields are missing in the payload/
      )
    })
  })

  describe('create', () => {
    it('rejects an invalid DID', async () => {
      await expect(buildRegistrar().create('not-a-did', validDoc)).rejects.toThrow(/Invalid did provided/i)
    })

    it('rejects an empty DID document', async () => {
      await expect(buildRegistrar().create(VALID_DID, {} as never)).rejects.toThrow(/valid did document/)
    })
  })
})
