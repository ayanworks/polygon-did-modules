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
import { KeyManagementApi } from '@credo-ts/core/kms'
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
    const publicKeyHex = signingKey.publicKey.substring(2) // Remove '0x' prefix
    const publicKeyBuffer = Buffer.from(publicKeyHex, 'hex')
    const publicKeyBase58 = TypedArrayEncoder.toBase58(publicKeyBuffer)

    // Transform to JWK
    const { privateJwk } = transformPrivateKeyToPrivateJwk({
      type: { kty: 'EC', crv: 'secp256k1' },
      privateKey: privateKey,
    })
    privateJwk.kid = publicKeyBase58

    // Check if key already exists (idempotency)
    let publicJwk = await kmsApi.getPublicKey({ keyId: publicKeyBase58 })
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
      const signingKeyForTx = await this.getSigningKey(agentContext, publicKeyBase58)
      const didRegistry = ledgerService.createDidRegistryInstance(signingKeyForTx)

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

      const publicKeyBase58 = await this.getPublicKeyFromDid(agentContext, options.did)

      if (!publicKeyBase58) {
        throw new CredoError('Public Key not found in wallet')
      }

      const signingKey = await this.getSigningKey(agentContext, publicKeyBase58)

      const didRegistry = ledgerService.createDidRegistryInstance(signingKey)

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

      const publicKeyBase58 = await this.getPublicKeyFromDid(agentContext, options.did)

      if (!publicKeyBase58) {
        throw new CredoError('Public Key not found in wallet')
      }

      const signingKey = await this.getSigningKey(agentContext, publicKeyBase58)

      const didRegistry = ledgerService.createDidRegistryInstance(signingKey)

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

  private async getSigningKey(agentContext: AgentContext, publicKeyBase58: string): Promise<SigningKey> {
    // Access wallet through dependencyManager since agentContext.wallet is not available in this version
    const wallet = agentContext.dependencyManager.resolve<any>(Symbol.for('Wallet'))

    if (!wallet) {
      throw new CredoError('Wallet not available in agent context')
    }

    const keyEntry = await wallet.withSession(async (session: any) => await session.fetchKey({ name: publicKeyBase58 }))

    if (!keyEntry) {
      throw new CredoError(`Key not found for publicKeyBase58: ${publicKeyBase58}`)
    }

    const signingKey = new SigningKey(keyEntry.key.secretBytes)

    keyEntry.key.handle.free()

    return signingKey
  }

  private async getPublicKeyFromDid(agentContext: AgentContext, did: string) {
    const didRepository = agentContext.dependencyManager.resolve(DidRepository)

    const didRecord = await didRepository.findCreatedDid(agentContext, did)
    if (!didRecord) {
      throw new CredoError('DidRecord not found')
    }

    if (!didRecord.didDocument?.verificationMethod) {
      throw new CredoError('VerificationMethod not found cannot get public key')
    }

    const publicKeyBase58 = didRecord.didDocument.verificationMethod[0].publicKeyBase58

    return publicKeyBase58
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
