/** biome-ignore-all lint/suspicious/noConsole: <explanation> */
import DidRegistryContract from '@ayanworks/polygon-did-registry-contract'
import { getResolver } from '@ayanworks/polygon-did-resolver'
import axios from 'axios'
import { Resolver } from 'did-resolver'
import { Contract, JsonRpcProvider, Network, SigningKey, Wallet } from 'ethers'
import { v4 as uuidv4 } from 'uuid'
import SchemaRegistryAbi from './abi/SchemaRegistry.json'
import { buildSchemaResource, parseDid, validateDid } from './utils'

export type PolygonDidInitOptions = {
  didRegistrarContractAddress: string
  rpcUrl: string
  signingKey: SigningKey
  schemaManagerContractAddress: string
  serverUrl: string
  fileServerToken: string
}

export type PolygonDidRegisterOptions = {
  did: string
  publicKeyBase58: string
  serviceEndpoint?: string
}

export type ResourcePayload = {
  resourceURI: string
  resourceCollectionId: string
  resourceId: string
  resourceName: string
  resourceType: string
  mediaType: string
  created: string
  checksum: string
  previousVersionId: string | null
  nextVersionId: string | null
}

export type EstimatedTxDetails = {
  transactionFee: string
  gasLimit: string
  gasPrice: string
  maxFeePerGas: number
  maxPriorityFeePerGas: number
  network: string
  chainId: string
  method: string
}

export class PolygonSchema {
  private didRegistry: Contract
  private schemaRegistry: Contract
  private fileServerUrl: string
  private accessToken: string
  private schemaManagerContractAddress: string
  private rpcUrl: string
  public resolver: Resolver

  public constructor({
    didRegistrarContractAddress,
    schemaManagerContractAddress,
    rpcUrl,
    serverUrl,
    fileServerToken,
    signingKey,
  }: PolygonDidInitOptions) {
    this.resolver = new Resolver(getResolver())
    this.schemaManagerContractAddress = schemaManagerContractAddress
    this.rpcUrl = rpcUrl
    const provider = new JsonRpcProvider(rpcUrl)
    const wallet = new Wallet(signingKey, provider)
    this.didRegistry = new Contract(didRegistrarContractAddress, DidRegistryContract.abi, wallet)
    this.accessToken = fileServerToken
    this.fileServerUrl = serverUrl
    this.schemaRegistry = new Contract(schemaManagerContractAddress, SchemaRegistryAbi, wallet)
  }

  public async createSchema(did: string, schemaName: string, schema: object) {
    if (!schemaName || Object?.keys(schema)?.length === 0) {
      throw new Error(`Schema name and Schema are required!`)
    }

    let schemaId = ''
    let tnxSchemaId = ''
    let schemaTxhash: string = ''

    if (!this.accessToken) {
      throw new Error(`Invalid token!`)
    }

    try {
      const isValidDid = validateDid(did)
      if (!isValidDid) {
        throw new Error('Invalid did provided')
      }
      const parsedDid = parseDid(did)

      const didDetails = await this.resolver.resolve(did)
      if (!didDetails.didDocument) {
        throw new Error(`The DID document for the given DID was not found!`)
      }

      schemaId = uuidv4()
      const schemaResource: ResourcePayload = await buildSchemaResource(did, schemaId, schemaName, schema)

      const schemaTxnReceipt = await this.schemaRegistry.createSchema(
        parsedDid.didAddress,
        schemaId,
        JSON.stringify(schemaResource)
      )
      // To change the nonce for next transaction
      await schemaTxnReceipt.wait()

      if (!schemaTxnReceipt.hash) {
        throw new Error(`Error while adding schema in Registry!`)
      }

      const uploadSchemaDetails = await this.uploadSchemaFile(schemaId, schema)

      if (!uploadSchemaDetails) {
        throw new Error(`Error while uploading schema on file server!`)
      }
      const addedResourcetxnReceipt = await this.didRegistry.addResource(
        parsedDid.didAddress,
        schemaId,
        JSON.stringify(schemaResource)
      )

      if (!addedResourcetxnReceipt.hash) {
        tnxSchemaId = schemaId
        schemaTxhash = schemaTxnReceipt.hash
        throw new Error(`Error while adding schema resource in DID Registry!`)
      }

      return {
        did,
        schemaId,
        schemaTxnHash: schemaTxnReceipt.hash,
        resourceTxnHash: addedResourcetxnReceipt.hash,
      }
    } catch (error) {
      console.log(`Error occurred in createSchema function ${error} `)
      return {
        tnxSchemaId,
        schemaTxhash,
        schemaState: {
          state: 'failed',
          reason: `unknownError: ${error}`,
        },
      }
    }
  }

  public async getSchemaById(did: string, schemaId: string) {
    try {
      if (!schemaId) {
        throw new Error(`Schema id is required!`)
      }
      const isValidDid = validateDid(did)
      if (!isValidDid) {
        throw new Error('invalid did provided')
      }

      const parsedDid = parseDid(did)

      const didDetails = await this.resolver.resolve(did)
      if (!didDetails.didDocument) {
        throw new Error(`The DID document for the given DID was not found!`)
      }
      const schemaDetails = await this.schemaRegistry.getSchemaById(parsedDid.didAddress, schemaId)
      if (!schemaDetails) {
        throw new Error('Error while fetching schema details by schema id!')
      }
      return JSON.parse(schemaDetails)
    } catch (error) {
      console.log(`Error occurred in createSchema function ${error} `)
      throw error
    }
  }

  public async getAllSchemaByDID(did: string) {
    try {
      const isValidDid = validateDid(did)
      if (!isValidDid) {
        throw new Error('invalid did provided')
      }
      const didDetails = await this.resolver.resolve(did)

      if (!didDetails?.didDocumentMetadata?.linkedResourceMetadata) {
        return []
      }
      const linkedResourceMetadata = didDetails?.didDocumentMetadata?.linkedResourceMetadata
      const schemaList: ResourcePayload[] = linkedResourceMetadata.filter(
        (element: ResourcePayload) => element.resourceType === 'W3C-schema'
      )
      return schemaList
    } catch (error) {
      console.log(`Error occurred in getAllSchemaByDID function ${error} `)
      throw error
    }
  }

  private async uploadSchemaFile(schemaResourceId: string, schema: object) {
    try {
      if (!schemaResourceId || Object?.keys(schema)?.length === 0) {
        throw new Error(`Schema resource id and schema are required!`)
      }
      const schemaPayload = {
        schemaId: `${schemaResourceId}`,
        schema,
      }

      const axiosOptions = {
        method: 'post',
        url: `${this.fileServerUrl}/schemas`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        data: JSON.stringify(schemaPayload),
      }

      const response = await axios(axiosOptions)
      return response
    } catch (error) {
      console.log(`Error occurred in uploadSchemaFile function ${error} `)
      throw error
    }
  }

  public async estimateTxFee(method: string, argument?: string[]): Promise<EstimatedTxDetails | null> {
    try {
      if (!method) {
        throw new Error(`Method is required for estimate transaction!`)
      }
      const provider = new JsonRpcProvider(this.rpcUrl)
      const contract = new Contract(this.schemaManagerContractAddress, SchemaRegistryAbi, provider)

      // Encode function data
      const encodedFunction = await contract.interface.encodeFunctionData(method, argument)

      // Check if encodedFunction is null or empty
      if (!encodedFunction) {
        throw new Error('Error while getting encoded function details')
      }

      // Estimate gas limit
      const gasLimit = await provider.estimateGas({
        to: this.schemaManagerContractAddress,
        data: encodedFunction,
      })

      // Convert gas limit to Gwei
      const gasLimitGwei = parseFloat(String(gasLimit)) / 1e9

      // Get gas price details
      const gasPriceDetails = await provider.getFeeData()

      // Check if gas price details are available
      if (!gasPriceDetails || !gasPriceDetails.gasPrice) {
        throw new Error('Gas price details not found!')
      }

      // Convert gas price to Gwei
      const gasPriceGwei = parseFloat(String(gasPriceDetails.gasPrice)) / 1e9

      // Get network details
      const networkDetails: Network = await provider.getNetwork()

      // Check if network details are available
      if (!networkDetails) {
        throw new Error('Network details not found!')
      }
      const maxGasFee = parseFloat(String(gasPriceDetails.maxFeePerGas)) / 1e9

      // Calculate transaction fee
      const transactionFee = gasLimitGwei * maxGasFee

      // Create EstimatedTxDetails object
      const estimatedTxDetails: EstimatedTxDetails = {
        transactionFee: String(transactionFee),
        gasLimit: String(gasLimitGwei),
        gasPrice: String(gasPriceGwei),
        maxFeePerGas: maxGasFee,
        maxPriorityFeePerGas: parseFloat(String(gasPriceDetails.maxPriorityFeePerGas)) / 1e9,
        network: String(networkDetails.name),
        chainId: String(networkDetails.chainId),
        method,
      }

      return estimatedTxDetails
    } catch (error) {
      console.error('Error calculating transaction fee:', error)
      return null
    }
  }

  public async validateSchemaObject(json: Record<string, any>) {
    try {
      if (typeof json !== 'object' || json === null) {
        throw new Error('Schema object is not a valid JSON!')
      }
      // Check if @context exists and is an object
      if (
        !('@context' in json) || // Check if '@context' property exists
        (typeof json['@context'] !== 'object' && !Array.isArray(json['@context'])) || // Check if '@context' is neither an object nor an array
        json['@context'] === null // Check if '@context' is null
      ) {
        throw new Error('Invalid schema context!')
      }

      return true
    } catch (error) {
      console.error('Error validating schema JSON:', error)
      return null
    }
  }
}
