import type { DidCreateResult, DidDocument } from '@credo-ts/core'

import {
  CredoError,
  DidDocumentBuilder,
  DidDocumentService,
  getEcdsaSecp256k1VerificationKey2019,
  VERIFICATION_METHOD_TYPE_ECDSA_SECP256K1_VERIFICATION_KEY_2019,
} from '@credo-ts/core'
import type { PublicJwk, Secp256k1PublicJwk } from '@credo-ts/core/kms'
import { Secp256k1PublicJwk as Secp256k1PublicJwkClass } from '@credo-ts/core/kms'
import { computeAddress } from 'ethers'
import { SECURITY_CONTEXT_SECP256k1_URL } from '../signature-suites/EcdsaSecp256k1Signature2019'

/**
 * Helper to create Secp256k1PublicJwk from base64url-encoded x and y coordinates
 */
export function createSecp256k1PublicJwk(publicJwk: { x: string; y: string }): Secp256k1PublicJwk {
  const publicKeyHex =
    Buffer.from(publicJwk.x, 'base64url').toString('hex') + Buffer.from(publicJwk.y, 'base64url').toString('hex')

  return Secp256k1PublicJwkClass.fromPublicKey(Buffer.from(publicKeyHex, 'hex'))
}

export const polygonDidRegex = new RegExp(/^did:polygon(:testnet)?:0x[0-9a-fA-F]{40}$/)

export const isValidPolygonDid = (did: string) => polygonDidRegex.test(did)

export function buildDid(method: string, network: string, publicKey: string): string {
  const address = computeAddress(`0x${publicKey}`)

  if (network === 'mainnet') {
    return `did:${method}:${address}`
  }

  return `did:${method}:${network}:${address}`
}

export function failedResult(reason: string): DidCreateResult {
  return {
    didDocumentMetadata: {},
    didRegistrationMetadata: {},
    didState: {
      state: 'failed',
      reason: reason,
    },
  }
}

export function getSecp256k1DidDoc(
  did: string,
  publicJwk: PublicJwk<Secp256k1PublicJwk>,
  serviceEndpoint?: string
): DidDocument {
  const verificationMethod = getEcdsaSecp256k1VerificationKey2019({
    id: `${did}#key-1`,
    publicJwk,
    controller: did,
  })

  const didDocumentBuilder = new DidDocumentBuilder(did)
  didDocumentBuilder.addContext(SECURITY_CONTEXT_SECP256k1_URL).addVerificationMethod(verificationMethod)

  if (serviceEndpoint) {
    const service = new DidDocumentService({
      id: `${did}#linked-domain`,
      serviceEndpoint,
      type: 'LinkedDomains',
    })
    didDocumentBuilder.addService(service)
  }

  didDocumentBuilder
    .addAuthentication(verificationMethod.id)
    .addAssertionMethod(verificationMethod.id)
    .addCapabilityDelegation(verificationMethod.id)
    .addCapabilityInvocation(verificationMethod.id)
    .addKeyAgreement(verificationMethod.id)

  return didDocumentBuilder.build()
}

export function validateSpecCompliantPayload(didDocument: DidDocument): string | null {
  // id is required, validated on both compile and runtime
  if (!didDocument.id && !didDocument.id.startsWith('did:polygon:')) return 'id is required'

  // verificationMethod is required
  if (!didDocument.verificationMethod) return 'verificationMethod is required'

  // verificationMethod must be an array
  if (!Array.isArray(didDocument.verificationMethod)) return 'verificationMethod must be an array'

  // verificationMethod must be not be empty
  if (!didDocument.verificationMethod.length) return 'verificationMethod must be not be empty'

  // verificationMethod types must be supported
  const isValidVerificationMethod = didDocument.verificationMethod.every((vm) => {
    switch (vm.type) {
      case VERIFICATION_METHOD_TYPE_ECDSA_SECP256K1_VERIFICATION_KEY_2019:
        return vm?.publicKeyBase58 && vm?.controller && vm?.id
      default:
        return false
    }
  })

  if (!isValidVerificationMethod) return 'verificationMethod is Invalid'

  if (didDocument.service) {
    const isValidService = didDocument.service
      ? didDocument?.service?.every((s) => {
          return s?.serviceEndpoint && s?.id && s?.type
        })
      : true

    if (!isValidService) return 'Service is Invalid'
  }

  return null
}
