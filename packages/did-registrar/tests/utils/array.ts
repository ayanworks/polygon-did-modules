export const arrayHasKeys = (array1: string[], array2: string[]) => {
  const keys1 = Object.keys(array1)
  const keys2 = Object.keys(array2)

  if (keys1.length !== keys2.length) {
    return false
  }

  for (const key of keys1) {
    if (!keys2.includes(key)) {
      return false
    }
  }

  return true
}

export type VerificationMethod = {
  id: string
  type: string
  controller: string
  publicKeyBase58: string
}

export type DidDocument = {
  '@context': string | string[]
  id: string
  verificationMethod: VerificationMethod[]
  authentication?: string[]
  assertionMethod?: string[]
  capabilityDelegation?: string[]
  capabilityInvocation?: string[]
  keyAgreement?: string[]
  service?: Array<{
    id: string
    type: string
    serviceEndpoint: string
  }>
}

export function buildTestDidDoc(did: string, publicKeyBase58: string, serviceEndpoint?: string): DidDocument {
  const verificationMethod: VerificationMethod = {
    id: `${did}#key-1`,
    type: 'EcdsaSecp256k1VerificationKey2019',
    controller: did,
    publicKeyBase58,
  }

  const doc: DidDocument = {
    '@context': [
      "https://w3id.org/did/v1",
      "https://w3id.org/security/suites/secp256k1-2019/v1"
    ],
    id: did,
    verificationMethod: [verificationMethod],
    authentication: [verificationMethod.id],
    assertionMethod: [verificationMethod.id],
    capabilityDelegation: [verificationMethod.id],
    capabilityInvocation: [verificationMethod.id],
    keyAgreement: [verificationMethod.id],
  }

  if (serviceEndpoint) {
    doc.service = [
      {
        id: `${did}#linked-domain`,
        type: 'LinkedDomains',
        serviceEndpoint,
      },
    ]
  }

  return doc
}
