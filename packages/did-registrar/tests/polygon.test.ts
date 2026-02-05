import { SigningKey } from 'ethers'
import { assert, beforeAll, describe, it } from 'vitest'
import { PolygonDID } from '../src/registrar'
import { resourceJson, testContractDetails, testDidDetails, updateDidDocument } from './fixtures/test.data'
import { arrayHasKeys, buildTestDidDoc } from './utils/array'

const NETWORK_URL = testContractDetails.networkUrl
const CONTRACT_ADDRESS = testContractDetails.contractAddress //Can add external smart contract address

describe('Registrar', () => {
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
    keyPair.privateKey = testDidDetails.privateKey //test key
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
    await new Promise((r) => setTimeout(r, 5000))
  })

  describe('test create did function', () => {
    it('should get address', async () => {
      assert.ok(keyPair.address)
      assert.strictEqual(keyPair.address.slice(0, 2), '0x')
      assert.strictEqual(keyPair.address.length, 42)
    })

    it('should get public key base58', async () => {
      assert.ok(keyPair.publicKeyBase58)
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

  describe.skip('test register DID function', () => {
    it('should get transaction hash after DID register ', async () => {
      const builtTestDidDoc = buildTestDidDoc(polygonDID, keyPair.publicKeyBase58, 'https://example.com')

      const registerDidRes = await polygonDidRegistrar.create(polygonDID, builtTestDidDoc)
      assert.ok(registerDidRes.txnHash)
      assert.equal(
        arrayHasKeys(Object.keys(registerDidRes.txnHash), [
          'provider',
          'blockNumber',
          'blockHash',
          'index',
          'hash',
          'type',
          'to',
          'from',
          'nonce',
          'gasLimit',
          'gasPrice',
          'maxPriorityFeePerGas',
          'maxFeePerGas',
          'maxFeePerBlobGas',
          'data',
          'value',
          'chainId',
          'signature',
          'accessList',
          'blobVersionedHashes',
        ]),
        true
      )
    })
  })

  describe.skip('test update DID doc function', () => {
    let updateDidRes: any

    beforeAll(async () => {
      updateDidRes = await polygonDidRegistrar.update(polygonDID, updateDidDocument)
    })

    it('should have a valid updateDidRes object', () => {
      assert.notStrictEqual(updateDidRes?.txnHash?.hash, '')
      assert.notStrictEqual(updateDidRes?.txnHash?.nonce, '')
    })
  })

  describe.skip('test register DID linked-resource function', () => {
    let addedResource: any

    beforeAll(async () => {
      addedResource = await polygonDidRegistrar.addResource(polygonDID, resourceJson)
    })

    it('should get transaction hash after register DID document', async () => {
      assert.ok(addedResource.txnHash)
      assert.equal(
        arrayHasKeys(Object.keys(addedResource.txnHash), [
          'provider',
          'blockNumber',
          'blockHash',
          'index',
          'hash',
          'type',
          'to',
          'from',
          'nonce',
          'gasLimit',
          'gasPrice',
          'maxPriorityFeePerGas',
          'maxFeePerGas',
          'data',
          'value',
          'chainId',
          'signature',
          'accessList',
        ]),
        true
      )
    })
  })

  describe.skip('test resolve DID linked-resource by DID and resourceId function', () => {
    let resolveResourceByDidAndId: any

    beforeAll(async () => {
      resolveResourceByDidAndId = await polygonDidRegistrar.getResourceByDidAndResourceId(
        polygonDID,
        '9c64d7c6-5678-4bc2-91e2-d4a0688e8a76'
      )
    })

    it('should match correct resource details after resolving linked resource with valid DID', async () => {
      const expectedKeys = [
        'resourceURI',
        'resourceCollectionId',
        'resourceId',
        'resourceName',
        'resourceType',
        'mediaType',
        'created',
        'checksum',
        'previousVersionId',
        'nextVersionId',
      ]

      assert.deepStrictEqual(Object.keys(resolveResourceByDidAndId.linkedResource), expectedKeys)
    })
  })

  describe.skip('test resolve all DID linked-resource by DID function', () => {
    let resolveResourceByDid: any

    beforeAll(async () => {
      resolveResourceByDid = await polygonDidRegistrar.getResourcesByDid(polygonDID)
    })

    it('should match correct resource details after resolving linked resource with valid DID', async () => {
      const expectedKeys = [
        'resourceURI',
        'resourceCollectionId',
        'resourceId',
        'resourceName',
        'resourceType',
        'mediaType',
        'created',
        'checksum',
        'previousVersionId',
        'nextVersionId',
      ]

      resolveResourceByDid?.linkedResource?.forEach((resource: any) => {
        assert.deepStrictEqual(Object.keys(resource), expectedKeys)
      })
    })
  })

  describe('test estimate transaction', () => {
    let transactionDetails: any

    beforeAll(async () => {
      transactionDetails = await polygonDidRegistrar.estimateTxFee('createDID', [
        '0x13cd23928Ae515b86592C630f56C138aE4c7B79a',
        '68768734687ytruwytuqyetrywqt',
      ])
    })

    it('should have non-empty values for transaction details', () => {
      assert.ok(transactionDetails)

      assert.ok(transactionDetails.transactionFee, 'transactionFee should not be null, undefined, or empty')
      assert.ok(transactionDetails.gasLimit, 'gasLimit should not be null, undefined, or empty')
      assert.ok(transactionDetails.gasPrice, 'gasPrice should not be null, undefined, or empty')
      assert.ok(transactionDetails.network, 'network should not be null, undefined, or empty')
      assert.ok(transactionDetails.chainId, 'chainId should not be null, undefined, or empty')
      assert.ok(transactionDetails.method, 'method should not be null, undefined, or empty')
    })
  })
})
