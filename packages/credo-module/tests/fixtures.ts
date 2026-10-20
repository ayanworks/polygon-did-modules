import { CREDENTIALS_CONTEXT_V1_URL } from '@credo-ts/core'

/**
 * Deterministic secp256k1 key used across the credo-module tests.
 *
 * The signature-suite tests previously carried checked-in signatures. Those had
 * two problems: they were frozen against one Credo version, and they encoded the
 * JWS header `alg: "EcDSA"`, which Credo 0.7 rejects because it is not a
 * registered JWA identifier. The signed documents are now produced at runtime
 * with this throwaway key, so they can never drift from the suite.
 *
 * The DID is derived the same way `PolygonDidRegistrar` does it: from the
 * uncompressed (x || y) public key. Addressing the key by its x-coordinate alone
 * yields a different, wrong address.
 *
 * Derived DID: did:polygon:testnet:0x138d2231e4362fc0e028576Fb2DF56904bd59C1b
 */
export const TEST_PRIVATE_KEY_HEX = '5a4a2c79f4bceb4976dde41897b2607e01e6b74a42bc854a7a20059cfa99a095'

export const TEST_ISSUER_DID = 'did:polygon:testnet:0x138d2231e4362fc0e028576Fb2DF56904bd59C1b'

export const TEST_VERIFICATION_METHOD = `${TEST_ISSUER_DID}#key-1`

const PERMANENT_RESIDENT_CARD_SUBJECT = {
  id: 'did:example:b34ca6cd37bbf23',
  type: ['PermanentResident', 'Person'],
  givenName: 'JOHN',
  familyName: 'SMITH',
  gender: 'Male',
  image: 'data:image/png;base64,iVBORw0KGgokJggg==',
  residentSince: '2015-01-01',
  lprCategory: 'C09',
  lprNumber: '999-999-999',
  commuterClassification: 'C1',
  birthCountry: 'Bahamas',
  birthDate: '1958-07-17',
}

export const EcdsaSecp256k1Signature2019Fixtures = {
  TEST_LD_DOCUMENT: {
    '@context': [CREDENTIALS_CONTEXT_V1_URL, 'https://w3id.org/citizenship/v1'],
    id: 'https://issuer.oidp.uscis.gov/credentials/83627465',
    type: ['VerifiableCredential', 'PermanentResidentCard'],
    issuer: TEST_ISSUER_DID,
    identifier: '83627465',
    name: 'Permanent Resident Card',
    description: 'Government of Example Permanent Resident Card.',
    issuanceDate: '2019-12-03T12:19:52Z',
    expirationDate: '2029-12-03T12:19:52Z',
    credentialSubject: { ...PERMANENT_RESIDENT_CARD_SUBJECT },
  },
  /**
   * Same credential as TEST_LD_DOCUMENT but issued by a DID this wallet does not
   * control, so signing it must fail. `proof` is intentionally absent: it is
   * filled in at runtime.
   */
  TEST_LD_DOCUMENT_UNKNOWN_ISSUER: {
    '@context': [CREDENTIALS_CONTEXT_V1_URL, 'https://w3id.org/citizenship/v1'],
    id: 'https://issuer.oidp.uscis.gov/credentials/83627465',
    type: ['VerifiableCredential', 'PermanentResidentCard'],
    issuer: 'did:polygon:testnet:0x26C2809EC8385bB15eb66586582e3D4626ee63C7',
    identifier: '83627465',
    name: 'Permanent Resident Card',
    description: 'Government of Example Permanent Resident Card.',
    issuanceDate: '2019-12-03T12:19:52Z',
    expirationDate: '2029-12-03T12:19:52Z',
    credentialSubject: { ...PERMANENT_RESIDENT_CARD_SUBJECT },
  },
  TEST_VP_DOCUMENT: {
    '@context': [CREDENTIALS_CONTEXT_V1_URL],
    type: ['VerifiablePresentation'],
  },
}

/**
 * Expected document for the *live* DID registered on Amoy at
 * did:polygon:testnet:0x138d2231e4362fc0e028576Fb2DF56904bd59C1b.
 * Used by the resolver e2e test, which resolves against the public RPC on
 * purpose - do not repoint these DIDs at a local test key.
 */
export const PolygonDIDFixtures = {
  VALID_DID_DOCUMENT: {
    didDocument: {
      '@context': ['https://w3id.org/did/v1', 'https://w3id.org/security/suites/secp256k1-2019/v1'],
      id: 'did:polygon:testnet:0x138d2231e4362fc0e028576Fb2DF56904bd59C1b',
      verificationMethod: [
        {
          id: 'did:polygon:testnet:0x138d2231e4362fc0e028576Fb2DF56904bd59C1b#key-1',
          type: 'EcdsaSecp256k1VerificationKey2019',
          controller: 'did:polygon:testnet:0x138d2231e4362fc0e028576Fb2DF56904bd59C1b',
          publicKeyBase58: '29rkwHiVCjyhXk9FWhepUrHpEyurUSCFHh4aoDqb1adj8',
        },
      ],
      service: [
        {
          id: 'did:polygon:testnet:0x138d2231e4362fc0e028576Fb2DF56904bd59C1b#linked-domain',
          serviceEndpoint: 'https://dev-agent.credebl.id',
          type: 'LinkedDomains',
        },
      ],
      authentication: ['did:polygon:testnet:0x138d2231e4362fc0e028576Fb2DF56904bd59C1b#key-1'],
      assertionMethod: ['did:polygon:testnet:0x138d2231e4362fc0e028576Fb2DF56904bd59C1b#key-1'],
      keyAgreement: ['did:polygon:testnet:0x138d2231e4362fc0e028576Fb2DF56904bd59C1b#key-1'],
      capabilityInvocation: ['did:polygon:testnet:0x138d2231e4362fc0e028576Fb2DF56904bd59C1b#key-1'],
      capabilityDelegation: ['did:polygon:testnet:0x138d2231e4362fc0e028576Fb2DF56904bd59C1b#key-1'],
    },
    didDocumentMetadata: {
      linkedResourceMetadata: [],
    },
    didResolutionMetadata: {
      contentType: 'application/did+ld+json',
      resolutionTime: 1730803801926,
      servedFromCache: true,
    },
  },
}
