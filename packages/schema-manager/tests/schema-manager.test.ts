import { SigningKey } from 'ethers'
import { assert, beforeAll, describe, it } from 'vitest'
import { PolygonSchema, ResourcePayload } from '../src/schema-manager'
import {
  fileServerAccessToken,
  fileServerUrl,
  testContractDetails,
  testDidDetails,
  testSchemaId,
  testSchemaSample,
} from './fixtures/test.data'
import { arrayHasKeys } from './utils/array'

const NETWORK_URL = testContractDetails.networkUrl
const DID_REGISTRAR_CONTRACT_ADDRESS = testContractDetails.contractAddress
const SCHEMA_MANAGER_CONTRACT_ADDRESS = testContractDetails.schemaManagerContract

describe('Schema Manager', () => {
  let polygonSchemaManager: PolygonSchema

  beforeAll(async () => {
    polygonSchemaManager = new PolygonSchema({
      didRegistrarContractAddress: DID_REGISTRAR_CONTRACT_ADDRESS,
      schemaManagerContractAddress: SCHEMA_MANAGER_CONTRACT_ADDRESS,
      rpcUrl: NETWORK_URL,
      signingKey: new SigningKey(`0x${testDidDetails.privateKey}`),
      serverUrl: fileServerUrl,
      fileServerToken: fileServerAccessToken,
    })
    await new Promise((r) => setTimeout(r, 5000))
    registeredSchemaDetails = await polygonSchemaManager.createSchema(testDidDetails.did, 'PAN CARD', testSchemaSample)
  })

  let registeredSchemaDetails: any

  it.skip('should get transaction hash after registering schema with non-empty and non-null values for both schemaTxnReceipt and resourceTxnReceipt', async () => {
    assert.ok(registeredSchemaDetails?.txnReceipt?.schemaTxnReceipt)
    assert.ok(registeredSchemaDetails?.txnReceipt?.resourceTxnReceipt)

    // Check keys and values for schemaTxnReceipt

    const schemaReceiptKeys = Object.keys(registeredSchemaDetails.txnReceipt.schemaTxnReceipt)
    assert.equal(arrayHasKeys(schemaReceiptKeys, ['txnHash', 'to', 'from', 'nonce', 'gasLimit', 'chainId']), true)

    schemaReceiptKeys.forEach((key) => {
      assert.ok(registeredSchemaDetails?.txnReceipt?.schemaTxnReceipt[key], `${key} should not be empty or null`)
    })

    const resourceReceiptKeys = Object.keys(registeredSchemaDetails?.txnReceipt?.resourceTxnReceipt)
    assert.equal(arrayHasKeys(resourceReceiptKeys, ['txnHash', 'to', 'from', 'nonce', 'gasLimit', 'chainId']), true)

    resourceReceiptKeys.forEach((key) => {
      assert.ok(registeredSchemaDetails?.txnReceipt?.resourceTxnReceipt[key], `${key} should not be empty or null`)
    })
  })

  describe.skip('test getSchemaById function', () => {
    it('should have non-empty values for resourceURI and resourceCollectionId', async () => {
      const schemaDetail = await polygonSchemaManager.getSchemaById(testDidDetails.did, testSchemaId)
      assert.ok(schemaDetail)

      assert.ok(schemaDetail.resourceURI)
      assert.notStrictEqual(schemaDetail.resourceURI, '')

      assert.ok(schemaDetail.resourceCollectionId)
      assert.notStrictEqual(schemaDetail.resourceCollectionId, '')

      assert.ok(schemaDetail.resourceId)
      assert.notStrictEqual(schemaDetail.resourceId, '')

      assert.ok(schemaDetail.resourceType)
      assert.strictEqual(schemaDetail.resourceType, 'W3C-schema')
    })
  })

  describe('test getAllSchemaByDID function', () => {
    it('should have all the object keys for schemaList', async () => {
      const schemaList = await polygonSchemaManager.getAllSchemaByDID(testDidDetails.did)
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

      schemaList?.forEach((resource: ResourcePayload) => {
        assert.deepStrictEqual(Object.keys(resource), expectedKeys)
      })
    })
  })

  describe('test estimate transaction', () => {
    it('should have non-empty values for transaction details', async () => {
      const transactionDetails = await polygonSchemaManager.estimateTxFee('createSchema', [
        '0x13cd23928Ae515b86592C630f56C138aE4c7B79a',
        '550e8400-e29b-41d4-a716-446655440000',
        'dummy schema details',
      ])

      assert.ok(transactionDetails)

      assert.ok(transactionDetails.transactionFee, 'transactionFee should not be null, undefined, or empty')
      assert.ok(transactionDetails.gasLimit, 'gasLimit should not be null, undefined, or empty')
      assert.ok(transactionDetails.gasPrice, 'gasPrice should not be null, undefined, or empty')
      assert.ok(transactionDetails.network, 'network should not be null, undefined, or empty')
      assert.ok(transactionDetails.chainId, 'chainId should not be null, undefined, or empty')
      assert.ok(transactionDetails.method, 'method should not be null, undefined, or empty')
    })
  })

  describe('test schema validator', () => {
    it('should have validate the schema JSON', async () => {
      const isValidatedSchema = await polygonSchemaManager.validateSchemaObject(testSchemaSample)
      assert.ok(isValidatedSchema)

      assert.ok(isValidatedSchema)
      assert.strictEqual(isValidatedSchema, true)
    })
  })
})
