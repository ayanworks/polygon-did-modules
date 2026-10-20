import { SigningKey } from 'ethers'
import { assert, beforeAll, describe, it } from 'vitest'
import { PolygonDID } from '../src/registrar'
import { testContractDetails, testDidDetails } from './fixtures/test.data'
import { buildTestDidDoc } from './utils/array'

const NETWORK_URL = testContractDetails.networkUrl
const CONTRACT_ADDRESS = testContractDetails.contractAddress

/** Minimal base58 decode, so the test does not depend on the implementation. */
const decodeBase58 = (value: string): Buffer => {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let num = 0n
  for (const char of value) num = num * 58n + BigInt(alphabet.indexOf(char))
  let hex = num.toString(16)
  if (hex.length % 2) hex = `0${hex}`
  // Leading '1's are zero bytes and are lost by the numeric conversion.
  const leadingZeros = value.length - value.replace(/^1+/, '').length
  return Buffer.concat([Buffer.alloc(leadingZeros), Buffer.from(hex, 'hex')])
}

describe('Polygon-did-registrar', () => {
  let polygonDidRegistrar: PolygonDID
  let polygonDID: string
  let keyPair: {
    address: string
    privateKey: string
    publicKeyBase58: string
    did: string
  } = {
    address: '',
    privateKey: '',
    publicKeyBase58: '',
    did: '',
  }

  beforeAll(async () => {
    keyPair.address = testDidDetails.address
    keyPair.did = testDidDetails.did
    keyPair.privateKey = testDidDetails.privateKey
    keyPair.publicKeyBase58 = testDidDetails.publicKeyBase58
    polygonDID = testDidDetails.did

    if (!keyPair.address && !keyPair.did) {
      keyPair = PolygonDID.createKeyPair('testnet')
      polygonDID = keyPair.did
    }

    polygonDidRegistrar = new PolygonDID({
      contractAddress: CONTRACT_ADDRESS,
      rpcUrl: NETWORK_URL,
      signingKey: new SigningKey(`0x${keyPair.privateKey}`),
    })
  })

  describe('test createKeyPair function', () => {
    it('should get address', async () => {
      assert.ok(keyPair.address)
      assert.strictEqual(keyPair.address.slice(0, 2), '0x')
      assert.strictEqual(keyPair.address.length, 42)
    })

    it('should get public key base58', async () => {
      assert.ok(keyPair.publicKeyBase58)
    })

    it('should base58-encode the 33 public key bytes, not the hex text', async () => {
      const { publicKeyBase58, privateKey } = PolygonDID.createKeyPair('testnet')
      const decoded = decodeBase58(publicKeyBase58)
      const expected = SigningKey.computePublicKey(privateKey, true).slice(2)

      // 33 bytes is the compressed key; the old bug produced 68 (the ASCII text
      // "0x03ab..."), which no verifier could use.
      assert.strictEqual(decoded.length, 33)
      assert.strictEqual(decoded.toString('hex'), expected)

      // And guard the regression explicitly: the bytes must not spell the key out.
      assert.notStrictEqual(decoded.toString('utf8').slice(0, 2), '0x')
    })

    it('should get polygon DID', async () => {
      if (keyPair && keyPair.did.split(':')[2] === 'testnet') {
        assert.ok(keyPair.did)
        assert.strictEqual(keyPair.did.slice(0, 19), 'did:polygon:testnet')
        assert.strictEqual(keyPair.did.slice(20, 22), '0x')
        assert.strictEqual(keyPair.did.split(':')[3].length, 42)
      } else {
        assert.ok(keyPair.did)
        assert.strictEqual(keyPair.did.slice(0, 19), 'did:polygon')
        assert.strictEqual(keyPair.did.slice(20, 22), '0x')
        assert.strictEqual(keyPair.did.split(':')[3].length, 42)
      }
    })
  })

  describe.skip('test create DID function', () => {
    let createDidRes: { did: string; txnHash: string; didDoc: unknown }

    beforeAll(async () => {
      const builtTestDidDoc = buildTestDidDoc(polygonDID, keyPair.publicKeyBase58, 'https://example.com')
      createDidRes = await polygonDidRegistrar.create(polygonDID, builtTestDidDoc)
    })

    it('should return did after create', () => {
      assert.ok(createDidRes.did)
      assert.ok(createDidRes.txnHash)
    })
  })

  describe.skip('test update DID doc function', () => {
    let updateDidRes: { did: string; txnHash: string; didDoc: unknown }

    beforeAll(async () => {
      const updatedDidDoc = buildTestDidDoc(polygonDID, keyPair.publicKeyBase58, 'https://updated.example.com')
      updateDidRes = await polygonDidRegistrar.update(polygonDID, updatedDidDoc)
    })

    it('should have a valid updateDidRes object', () => {
      assert.notStrictEqual(updateDidRes?.txnHash, '')
    })
  })
})
