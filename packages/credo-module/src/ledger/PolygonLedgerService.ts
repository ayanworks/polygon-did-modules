import { type GenericSigner, PolygonDID } from '@ayanworks/polygon-did-registrar'
import { PolygonSchema } from '@ayanworks/polygon-schema-manager'
import type { AgentContext, DidDocument } from '@credo-ts/core'
import {
  CredoError,
  DidDocumentBuilder,
  DidRepository,
  inject,
  injectable,
  TypedArrayEncoder,
  utils,
} from '@credo-ts/core'
import { KeyManagementApi } from '@credo-ts/core/kms'
import { PolygonModuleConfig } from '../PolygonModuleConfig'
import { generateSecp256k1KeyPair, getSecp256k1DidDocWithPublicKey } from '../utils'

interface SchemaRegistryConfig {
  didRegistrarContractAddress: string
  rpcUrl: string
  fileServerToken: string
  privateKey: string
  schemaManagerContractAddress: string
  serverUrl: string
}

export type CreateDidOperationOptions = {
  operation: DidOperation.Create
  serviceEndpoint?: string
}

export type UpdateDidOperationOptions = {
  operation: DidOperation.Update
  didDocument: DidDocument
  did: string
}

export type DeactivateDidOperationOptions = {
  operation: DidOperation.Deactivate
  did: string
}

export type AddResourceDidOperationOptions = {
  operation: DidOperation.AddResource
  resourceId: string
  resource: object
  did: string
}

export enum DidOperation {
  Create = 'createDID',
  Update = 'updateDIDDoc',
  Deactivate = 'deactivate',
  AddResource = 'addResource',
}

export type DidOperationOptions =
  | CreateDidOperationOptions
  | UpdateDidOperationOptions
  | DeactivateDidOperationOptions
  | AddResourceDidOperationOptions

export type SchemaOperationOptions = CreateSchemaOperationOptions

export type CreateSchemaOperationOptions = {
  operation: SchemaOperation.CreateSchema
  did: string
}

export enum SchemaOperation {
  CreateSchema = 'createSchema',
}

@injectable()
export class PolygonLedgerService {
  public rpcUrl: string | undefined
  private didContractAddress: string | undefined
  private schemaManagerContractAddress: string | undefined
  private fileServerToken: string | undefined
  private fileServerUrl: string | undefined

  public constructor(
    @inject(PolygonModuleConfig) {
      didContractAddress,
      rpcUrl,
      fileServerToken,
      schemaManagerContractAddress,
      serverUrl,
    }: PolygonModuleConfig
  ) {
    this.rpcUrl = rpcUrl
    this.didContractAddress = didContractAddress
    this.schemaManagerContractAddress = schemaManagerContractAddress
    this.fileServerToken = fileServerToken
    this.fileServerUrl = serverUrl
  }

  public async createSchema(
    agentContext: AgentContext,
    { did, schemaName, schema }: { did: string; schemaName: string; schema: object }
  ) {
    const publicKey = await this.getPublicKeyBase58AndAddressFromDid(agentContext, did)

    if (!publicKey || !publicKey.publicKeyBase58) {
      throw new CredoError('Public Key not found in wallet')
    }

    if (!publicKey.address) {
      throw new CredoError(`Invalid address: ${publicKey.address}`)
    }

    const kmsSigner = await this.getSigner(agentContext, publicKey.publicKeyBase58)

    const schemaRegistry = this.createSchemaRegistryInstance(kmsSigner, publicKey.address)

    agentContext.config.logger.info(`Creating schema on ledger: ${did}`)

    const response = await schemaRegistry.createSchema(did, schemaName, schema)
    if (!response) {
      agentContext.config.logger.error(`Schema creation failed for did: ${did} and schema: ${schema}`)
      throw new CredoError(`Schema creation failed for did: ${did} and schema: ${schema}`)
    }
    agentContext.config.logger.info(`Published schema on ledger: ${did}`)
    return response
  }

  public async getSchemaByDidAndSchemaId(agentContext: AgentContext, did: string, schemaId: string) {
    agentContext.config.logger.info(`Getting schema from ledger: ${did} and schemaId: ${schemaId}`)

    const publicKey = await this.getPublicKeyBase58AndAddressFromDid(agentContext, did)

    if (!publicKey || !publicKey.publicKeyBase58) {
      throw new CredoError('Public Key not found in wallet')
    }

    if (!publicKey.address) {
      throw new CredoError(`Invalid address: ${publicKey.address}`)
    }

    const kmsSigner = await this.getSigner(agentContext, publicKey.publicKeyBase58)

    const schemaRegistry = this.createSchemaRegistryInstance(kmsSigner, publicKey.address)

    const response = await schemaRegistry.getSchemaById(did, schemaId)

    if (!response) {
      agentContext.config.logger.error(`Schema not found for did: ${did} and schemaId: ${schemaId} Error: ${response}`)
      throw new CredoError(`Schema not found for did: ${did} and schemaId: ${schemaId}`)
    }
    agentContext.config.logger.info(`Got schema from ledger: ${did} and schemaId: ${schemaId}`)
    return response
  }

  public async estimateFeeForDidOperation(agentContext: AgentContext, options: DidOperationOptions) {
    const keyPair = await generateSecp256k1KeyPair()

    const kmsSigner = await this.getSigner(agentContext, keyPair.publicKeyBase58)

    const didRegistry = this.createDidRegistryInstance(kmsSigner, keyPair.address)

    const { operation } = options

    if (operation === DidOperation.Create) {
      agentContext.config.logger.info(`Getting estimated fee for operation: ${operation} `)
      const did = `did:polygon:testnet${keyPair.address}`
      const didDoc = getSecp256k1DidDocWithPublicKey(did, keyPair.publicKeyBase58, options?.serviceEndpoint)

      const response = await didRegistry.estimateTxFee(DidOperation.Create, [keyPair.address, JSON.stringify(didDoc)])
      return response
    }

    if (operation === DidOperation.Update) {
      agentContext.config.logger.info(`Getting estimated fee for operation: ${operation} `)
      const address = options.did.split(':').pop() || ''

      const response = await didRegistry.estimateTxFee(
        DidOperation.Update,
        [address, JSON.stringify(options.didDocument)],
        address
      )
      return response
    }

    if (operation === DidOperation.Deactivate) {
      agentContext.config.logger.info(`Getting estimated fee for operation: ${operation} `)
      const address = options.did.split(':').pop() || ''
      const deactivatedDidDocument = new DidDocumentBuilder(options.did)
        .addContext('https://www.w3.org/ns/did/v1')
        .build()
      const response = await didRegistry.estimateTxFee(
        DidOperation.Update,
        [address, JSON.stringify(deactivatedDidDocument)],
        address
      )
      return response
    }

    if (operation === DidOperation.AddResource) {
      agentContext.config.logger.info(`Getting estimated fee for operation: ${operation} `)
      const address = options.did.split(':').pop() || ''
      const response = await didRegistry.estimateTxFee(
        DidOperation.AddResource,
        [address, options.resourceId, JSON.stringify(options.resource)],
        address
      )
      return response
    }
  }

  public async estimateFeeForSchemaOperation(agentContext: AgentContext, options: SchemaOperationOptions) {
    const keyPair = await generateSecp256k1KeyPair()

    const kmsSigner = await this.getSigner(agentContext, keyPair.publicKeyBase58)

    const schemaRegistry = this.createSchemaRegistryInstance(kmsSigner, keyPair.address)

    const { operation } = options

    const testResourceBody = {
      resourceURI:
        'did:polygon:testnet:0x13cd23928Ae515b86592C630f56C138aE4c7B79a/resources/398cee0a-efac-4643-9f4c-74c48c72a14b',
      resourceCollectionId: '55dbc8bf-fba3-4117-855c-1e0dc1d3bb47',
      resourceId: '398cee0a-efac-4643-9f4c-74c48c72a14b',
      resourceName: 'Eventbrite1 Logo',
      resourceType: 'W3C-schema',
      mediaType: 'image/svg+xml',
      created: '2022-11-17T08:10:36Z',
      checksum: 'a95380f460e63ad939541a57aecbfd795fcd37c6d78ee86c885340e33a91b559',
      previousVersionId: null,
      nextVersionId: null,
    }

    if (operation === SchemaOperation.CreateSchema) {
      agentContext.config.logger.info(`Getting estimated fee for operation: ${operation} `)
      const schemaEstimatedFee = await schemaRegistry.estimateTxFee(SchemaOperation.CreateSchema, [
        keyPair.address,
        utils.uuid(),
        JSON.stringify(testResourceBody),
      ])

      const resourceEstimatedFee = await this.estimateFeeForDidOperation(agentContext, {
        operation: DidOperation.AddResource,
        resourceId: utils.uuid(),
        resource: testResourceBody,
        did: options.did,
      })

      let feeParameters = {}

      if (schemaEstimatedFee && resourceEstimatedFee) {
        feeParameters = {
          estimatedTotalTxFee: Number(schemaEstimatedFee.transactionFee) + Number(resourceEstimatedFee.transactionFee),
          estimatedSchemaTxFee: schemaEstimatedFee,
          estimatedResourceTxFee: resourceEstimatedFee,
        }
      }

      return feeParameters
    }
  }

  public createDidRegistryInstance(signer: GenericSigner, userAddress: string) {
    if (!this.rpcUrl || !this.didContractAddress) {
      throw new CredoError('Ledger config not found')
    }

    return new PolygonDID({
      rpcUrl: this.rpcUrl,
      contractAddress: this.didContractAddress,
      signer,
      address: userAddress,
    })
  }

  private createSchemaRegistryInstance(signer: GenericSigner, userAddress: string) {
    if (
      !this.rpcUrl ||
      !this.schemaManagerContractAddress ||
      !this.fileServerToken ||
      !this.fileServerUrl ||
      !this.didContractAddress
    ) {
      throw new CredoError('Polygon schema module config not found')
    }

    return new PolygonSchema({
      rpcUrl: this.rpcUrl,
      didRegistrarContractAddress: this.didContractAddress,
      schemaManagerContractAddress: this.schemaManagerContractAddress,
      fileServerToken: this.fileServerToken,
      serverUrl: this.fileServerUrl,
      address: userAddress,
      signer,
    })
  }

  private async getSigner(agentContext: AgentContext, publicKeyBase58: string) {
    const kmsApi = agentContext.dependencyManager.resolve(KeyManagementApi)

    const signer = {
      sign: async (data: Uint8Array) => {
        const signedData = await kmsApi.sign({
          algorithm: 'ES256K',
          data,
          keyId: publicKeyBase58,
        })
        return TypedArrayEncoder.toHex(signedData.signature)
      },
    }

    return signer
  }

  private async getPublicKeyBase58AndAddressFromDid(agentContext: AgentContext, did: string) {
    const didRepository = agentContext.dependencyManager.resolve(DidRepository)

    const didRecord = await didRepository.findCreatedDid(agentContext, did)
    if (!didRecord) {
      throw new CredoError('DidRecord not found')
    }

    if (!didRecord.didDocument?.verificationMethod) {
      throw new CredoError('VerificationMethod not found cannot get public key')
    }

    const publicKeyBase58 = didRecord.didDocument.verificationMethod[0].publicKeyBase58

    const address = did.split(':').pop()

    return { publicKeyBase58, address }
  }

  public updateModuleConfig({
    didRegistrarContractAddress,
    fileServerToken,
    rpcUrl,
    schemaManagerContractAddress,
    serverUrl,
  }: SchemaRegistryConfig) {
    this.rpcUrl = rpcUrl
    this.didContractAddress = didRegistrarContractAddress
    this.schemaManagerContractAddress = schemaManagerContractAddress
    this.fileServerToken = fileServerToken
    this.fileServerUrl = serverUrl
  }
}
