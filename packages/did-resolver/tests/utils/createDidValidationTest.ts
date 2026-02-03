import { assert, it } from 'vitest'
import { POLYGON_DID_REGEX } from '../../src/utils'

export const createDidValidationTest = ({ did, isValid }: { did: string; isValid: boolean }) => {
  it(`should validate ${did}`, (_) => {
    assert.strictEqual(POLYGON_DID_REGEX.test(did), isValid)
  })
}
