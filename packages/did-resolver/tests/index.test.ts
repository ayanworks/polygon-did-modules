import type { DIDResolutionResult } from 'did-resolver'

import { Resolver } from 'did-resolver'
import { beforeAll, describe, expect, it } from 'vitest'
import { getResolver } from '../src'
import { DIDS, testDid } from './fixtures/test.data'
import { createDidValidationTest } from './utils/createDidValidationTest'

describe('polygon-did-resolver', () => {
  describe('Validate did', () => {
    DIDS.forEach(createDidValidationTest)
  })

  describe('Validate did document', () => {
    let resolveDidRes: DIDResolutionResult
    beforeAll(async () => {
      const polygonDidResolver = getResolver()
      const resolver = new Resolver(polygonDidResolver)
      resolveDidRes = await resolver.resolve(testDid)
    })

    it('should get DID document', async () => {
      expect(resolveDidRes.didDocument).toBeTruthy()
    })
  }) //commented for git actions
})
