import { getResolver } from '@ayanworks/polygon-did-resolver'
import { transformPrivateKeyToPrivateJwk } from '@credo-ts/askar'
import type {
  AgentContext,
  DidCreateOptions,
  DidCreateResult,
  DidDeactivateOptions,
  DidDeactivateResult,
  DidRegistrar,
  DidUpdateOptions,
  DidUpdateResult,
} from '@credo-ts/core'
import {
  CredoError,
  DidDocument,
  DidDocumentBuilder,
  DidDocumentRole,
  DidRecord,
  DidRepository,
  getEcdsaSecp256k1VerificationKey2019,
  JsonTransformer,
  TypedArrayEncoder,
} from '@credo-ts/core'
import type { KmsJwkPublic } from '@credo-ts/core/kms'
import { KeyManagementApi, KeyManagementKeyNotFoundError } from '@credo-ts/core/kms'
import { Resolver } from 'did-resolver'
import { Wallet as EtherWallet, JsonRpcProvider, SigningKey } from 'ethers'
import { PolygonLedgerService } from '../ledger'
import { buildDid, createSecp256k1PublicJwk, getSecp256k1DidDoc, validateSpecCompliantPayload } from './didPolygonUtil'

export class PolygonDidRegistrar implements DidRegistrar {
  public readonly supportedMethods = ['polygon']
  private resolver = new Resolver(getResolver())

  /**
   * Import a private key to KMS with idempotency check
   * Uses base58 public key as keyId for backward compatibility
   */
  private async importKeyToKms(
    agentContext: AgentContext,
    privateKey: Uint8Array
  ): Promise<{ publicKeyBase58: string; publicJwk: KmsJwkPublic; keyId: string }> {
    const kmsApi = agentContext.dependencyManager.resolve(KeyManagementApi)

    // Calculate base58 public key for kid
    const signingKey = new SigningKey(privateKey)
    const publicKeyHex = signingKey.compressedPublicKey.substring(2) // Remove '0x' prefix
    const publicKeyBuffer = Buffer.from(publicKeyHex, 'hex')
    const publicKeyBase58 = TypedArrayEncoder.toBase58(publicKeyBuffer)

    // Transform to JWK
    const { privateJwk } = transformPrivateKeyToPrivateJwk({
      type: { kty: 'EC', crv: 'secp256k1' },
      privateKey: privateKey,
    })
    privateJwk.kid = publicKeyBase58

    // Check if key already exists (idempotency)
    let publicJwk
    try {
      publicJwk = await kmsApi.getPublicKey({ keyId: publicKeyBase58 })
    } catch (error) {
      if (error instanceof KeyManagementKeyNotFoundError) {
        agentContext.config.logger.debug(`Key not found in wallet: ${error}`)
      }
    }
    let keyId = publicKeyBase58

    if (!publicJwk) {
      // Import new key
      const importedKey = await kmsApi.importKey({ privateJwk })
      publicJwk = importedKey.publicJwk
      keyId = importedKey.keyId
      agentContext.config.logger.debug(`Imported new key to KMS: ${keyId}`)
    } else {
      agentContext.config.logger.debug(`Key already exists in KMS: ${keyId}`)
    }

    return { publicKeyBase58, publicJwk, keyId }
  }

  public async create(agentContext: AgentContext, options: PolygonDidCreateOptions): Promise<DidCreateResult> {
    const ledgerService = agentContext.dependencyManager.resolve(PolygonLedgerService)
    const didRepository = agentContext.dependencyManager.resolve(DidRepository)

    const privateKey = options.secret.privateKey

    // Check balance using ethers wallet
    const signingKey = new SigningKey(privateKey)
    const wallet = new EtherWallet(signingKey)
    const provider = new JsonRpcProvider(ledgerService.rpcUrl)
    const value = await provider.getBalance(wallet.address)

    if (Number(value) === 0) {
      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
        didState: {
          state: 'failed',
          reason: 'Insufficient balance in wallet',
        },
      }
    }

    // Import key to KMS with base58 keyId
    const { publicKeyBase58, publicJwk } = await this.importKeyToKms(agentContext, privateKey)

    // Build DID from public key coordinates (we know it's EC with secp256k1)
    const ecPublicJwk = publicJwk as { x: string; y: string }
    const xHex = Buffer.from(ecPublicJwk.x, 'base64url').toString('hex')
    const yHex = Buffer.from(ecPublicJwk.y, 'base64url').toString('hex')
    const fullPublicKeyHex = xHex + yHex
    const did = buildDid(options.method, options.options.network, fullPublicKeyHex)

    agentContext.config.logger.info(`Creating DID on ledger: ${did}`)

    try {
      // Get signing key for transaction (uses base58 key name)
      const kmsSigner = await this.getSigner(agentContext, publicKeyBase58)
      const didRegistry = ledgerService.createDidRegistryInstance(kmsSigner, wallet.address)

      // Create DID document with PublicJwk
      const secp256k1Jwk = createSecp256k1PublicJwk(ecPublicJwk)
      const secpDidDoc = getSecp256k1DidDoc(did, secp256k1Jwk as any, options.options.endpoint)

      const response = await didRegistry.create(did, secpDidDoc as any)

      agentContext.config.logger.info(`Published did on ledger: ${did}`)

      const didDoc = response.didDoc
      const didDocument = JsonTransformer.fromJSON(didDoc, DidDocument)

      const didRecord = new DidRecord({
        did: didDocument.id,
        role: DidDocumentRole.Created,
        didDocument,
      })

      agentContext.config.logger.info(`Saving DID record to wallet: ${did} and did document: ${didDocument}`)

      await didRepository.save(agentContext, didRecord)

      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {
          txn: response.txnHash,
        },
        didState: {
          state: 'finished',
          did: didDocument.id,
          didDocument: didDocument,
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      agentContext.config.logger.error(`Error registering DID ${did} : ${errorMessage}`)
      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
        didState: {
          state: 'failed',
          reason: `unknownError: ${errorMessage}`,
        },
      }
    }
  }

  public async update(agentContext: AgentContext, options: PolygonDidUpdateOptions): Promise<DidUpdateResult> {
    const ledgerService = agentContext.dependencyManager.resolve(PolygonLedgerService)
    const didRepository = agentContext.dependencyManager.resolve(DidRepository)

    let didDocument: DidDocument
    let didRecord: DidRecord | null

    try {
      const isValidDidDoc = validateSpecCompliantPayload(options.didDocument)
      if (options.didDocument && isValidDidDoc === null) {
        didDocument = options.didDocument
        const resolvedDocument = await this.resolver.resolve(didDocument.id)
        didRecord = await didRepository.findCreatedDid(agentContext, didDocument.id)
        if (!resolvedDocument.didDocument || resolvedDocument.didDocumentMetadata.deactivated || !didRecord) {
          return {
            didDocumentMetadata: {},
            didRegistrationMetadata: {},
            didState: {
              state: 'failed',
              reason: 'Did not found',
            },
          }
        }

        if (options?.secret?.privateKey) {
          const privateKey = options.secret.privateKey

          // Validate private key
          try {
            new SigningKey(privateKey)
          } catch {
            return {
              didDocumentMetadata: {},
              didRegistrationMetadata: {},
              didState: {
                state: 'failed',
                reason: 'Invalid private key provided',
              },
            }
          }

          // Import key to KMS with base58 keyId
          const { publicKeyBase58: _, publicJwk } = await this.importKeyToKms(agentContext, privateKey)

          // Create verification method using publicJwk
          const verificationMethodCount = didDocument?.verificationMethod?.length ?? 0
          const ecPublicJwk = publicJwk as { x: string; y: string }
          const secp256k1Jwk = createSecp256k1PublicJwk(ecPublicJwk)
          const verificationMethod = getEcdsaSecp256k1VerificationKey2019({
            id: `${didDocument.id}#key-${verificationMethodCount + 1}`,
            publicJwk: secp256k1Jwk as any,
            controller: didDocument.id,
          })

          didDocument.verificationMethod = [...(didDocument?.verificationMethod ?? []), verificationMethod]
        }
      } else {
        return {
          didDocumentMetadata: {},
          didRegistrationMetadata: {},
          didState: {
            state: 'failed',
            reason: isValidDidDoc ?? 'Provide a valid didDocument',
          },
        }
      }

      if (!didRecord) {
        return {
          didDocumentMetadata: {},
          didRegistrationMetadata: {},
          didState: {
            state: 'failed',
            reason: 'DidRecord not found in wallet',
          },
        }
      }

      const publicKey = await this.getPublicKeyBase58AndAddressFromDid(agentContext, options.did)

      if (!publicKey || !publicKey.publicKeyBase58) {
        throw new CredoError('Public Key not found in wallet')
      }

      if (!publicKey.address) {
        throw new CredoError(`Invalid address: ${publicKey.address}`)
      }

      const kmsSigner = await this.getSigner(agentContext, publicKey.publicKeyBase58)

      const didRegistry = ledgerService.createDidRegistryInstance(kmsSigner, publicKey.address)

      const response = await didRegistry.update(didDocument.id, didDocument as any)

      if (!response) {
        throw new Error('Unable to update did document')
      }

      // Save the did document
      didRecord.didDocument = didDocument
      await didRepository.update(agentContext, didRecord)

      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {
          txn: response.txnHash,
        },
        didState: {
          state: 'finished',
          did: didDocument.id,
          didDocument,
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      agentContext.config.logger.error(`Error Updating DID : ${errorMessage}`)
      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
        didState: {
          state: 'failed',
          reason: `unknownError: ${errorMessage}`,
        },
      }
    }
  }

  public async deactivate(agentContext: AgentContext, options: DidDeactivateOptions): Promise<DidDeactivateResult> {
    const didRepository = agentContext.dependencyManager.resolve(DidRepository)
    const ledgerService = agentContext.dependencyManager.resolve(PolygonLedgerService)

    const did = options.did

    try {
      const { didDocument, didDocumentMetadata } = await this.resolver.resolve(did)

      const didRecord = await didRepository.findCreatedDid(agentContext, did)
      if (!didDocument || didDocumentMetadata.deactivated || !didRecord) {
        return {
          didDocumentMetadata: {},
          didRegistrationMetadata: {},
          didState: {
            state: 'failed',
            reason: 'Did not found',
          },
        }
      }

      const publicKey = await this.getPublicKeyBase58AndAddressFromDid(agentContext, options.did)

      if (!publicKey || !publicKey.publicKeyBase58) {
        throw new CredoError('Public Key not found in wallet')
      }

      if (!publicKey.address) {
        throw new CredoError(`Invalid address: ${publicKey.address}`)
      }

      const kmsSigner = await this.getSigner(agentContext, publicKey.publicKeyBase58)

      const didRegistry = ledgerService.createDidRegistryInstance(kmsSigner, publicKey.address)

      const updatedDidDocument = new DidDocumentBuilder(options.did).addContext('https://www.w3.org/ns/did/v1').build()

      const response = await didRegistry.update(didDocument.id, updatedDidDocument as any)

      if (!response) {
        throw new CredoError(`Unable to deactivate did document for did : ${did}`)
      }

      await didRepository.update(agentContext, didRecord)

      return {
        didDocumentMetadata: {
          deactivated: true,
        },
        didRegistrationMetadata: {
          txn: response.txnHash,
        },
        didState: {
          state: 'finished',
          did: didDocument.id,
          didDocument: JsonTransformer.fromJSON(didDocument, DidDocument),
          secret: options.secret,
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      agentContext.config.logger.error(`Error deactivating DID ${errorMessage}`)
      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
        didState: {
          state: 'failed',
          reason: `unknownError: ${errorMessage}`,
        },
      }
    }
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

    return {
      publicKeyBase58,
      address,
    }
  }
}

export interface PolygonDidCreateOptions extends DidCreateOptions {
  method: 'polygon'
  did?: never
  options: {
    network: 'mainnet' | 'testnet'
    endpoint?: string
  }
  secret: {
    privateKey: Uint8Array
  }
}

export interface PolygonDidUpdateOptions extends DidUpdateOptions {
  method: 'polygon'
  did: string
  didDocument: DidDocument
  secret?: {
    privateKey: Uint8Array
  }
}
