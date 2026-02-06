import type { AgentContext, JsonObject } from '@credo-ts/core'
import { CredoError, DidResolverService, isDid, vcLibraries } from '@credo-ts/core'

const { jsonld } = vcLibraries

const CREDENTIALS_V1 = {
  '@context': {
    '@version': 1.1,
    '@protected': true,
    id: '@id',
    type: '@type',
    VerifiableCredential: {
      '@id': 'https://www.w3.org/2018/credentials#VerifiableCredential',
      '@context': {
        '@version': 1.1,
        '@protected': true,
        id: '@id',
        type: '@type',
        cred: 'https://www.w3.org/2018/credentials#',
        sec: 'https://w3id.org/security#',
        xsd: 'http://www.w3.org/2001/XMLSchema#',
        credentialSchema: {
          '@id': 'cred:credentialSchema',
          '@type': '@id',
          '@context': {
            '@version': 1.1,
            '@protected': true,
            id: '@id',
            type: '@type',
            cred: 'https://www.w3.org/2018/credentials#',
            JsonSchemaValidator2018: 'cred:JsonSchemaValidator2018',
          },
        },
        credentialStatus: { '@id': 'cred:credentialStatus', '@type': '@id' },
        credentialSubject: { '@id': 'cred:credentialSubject', '@type': '@id' },
        evidence: { '@id': 'cred:evidence', '@type': '@id' },
        expirationDate: { '@id': 'cred:expirationDate', '@type': 'xsd:dateTime' },
        holder: { '@id': 'cred:holder', '@type': '@id' },
        issued: { '@id': 'cred:issued', '@type': 'xsd:dateTime' },
        issuer: { '@id': 'cred:issuer', '@type': '@id' },
        issuanceDate: { '@id': 'cred:issuanceDate', '@type': 'xsd:dateTime' },
        proof: { '@id': 'sec:proof', '@type': '@id', '@container': '@graph' },
        refreshService: {
          '@id': 'cred:refreshService',
          '@type': '@id',
          '@context': {
            '@version': 1.1,
            '@protected': true,
            id: '@id',
            type: '@type',
            cred: 'https://www.w3.org/2018/credentials#',
            ManualRefreshService2018: 'cred:ManualRefreshService2018',
          },
        },
        termsOfUse: { '@id': 'cred:termsOfUse', '@type': '@id' },
        validFrom: { '@id': 'cred:validFrom', '@type': 'xsd:dateTime' },
        validUntil: { '@id': 'cred:validUntil', '@type': 'xsd:dateTime' },
      },
    },
    VerifiablePresentation: {
      '@id': 'https://www.w3.org/2018/credentials#VerifiablePresentation',
      '@context': {
        '@version': 1.1,
        '@protected': true,
        id: '@id',
        type: '@type',
        cred: 'https://www.w3.org/2018/credentials#',
        sec: 'https://w3id.org/security#',
        holder: { '@id': 'cred:holder', '@type': '@id' },
        proof: { '@id': 'sec:proof', '@type': '@id', '@container': '@graph' },
        verifiableCredential: {
          '@id': 'cred:verifiableCredential',
          '@type': '@id',
          '@container': '@graph',
        },
      },
    },
    EcdsaSecp256k1Signature2019: {
      '@id': 'https://w3id.org/security#EcdsaSecp256k1Signature2019',
      '@context': {
        '@version': 1.1,
        '@protected': true,
        id: '@id',
        type: '@type',
        sec: 'https://w3id.org/security#',
        xsd: 'http://www.w3.org/2001/XMLSchema#',
        challenge: 'sec:challenge',
        created: { '@id': 'http://purl.org/dc/terms/created', '@type': 'xsd:dateTime' },
        domain: 'sec:domain',
        expires: { '@id': 'sec:expiration', '@type': 'xsd:dateTime' },
        jws: 'sec:jws',
        nonce: 'sec:nonce',
        proofPurpose: {
          '@id': 'sec:proofPurpose',
          '@type': '@vocab',
          '@context': {
            '@version': 1.1,
            '@protected': true,
            id: '@id',
            type: '@type',
            sec: 'https://w3id.org/security#',
            assertionMethod: { '@id': 'sec:assertionMethod', '@type': '@id', '@container': '@set' },
            authentication: { '@id': 'sec:authenticationMethod', '@type': '@id', '@container': '@set' },
          },
        },
        proofValue: 'sec:proofValue',
        verificationMethod: { '@id': 'sec:verificationMethod', '@type': '@id' },
      },
    },
    EcdsaSecp256r1Signature2019: {
      '@id': 'https://w3id.org/security#EcdsaSecp256r1Signature2019',
      '@context': {
        '@version': 1.1,
        '@protected': true,
        id: '@id',
        type: '@type',
        sec: 'https://w3id.org/security#',
        xsd: 'http://www.w3.org/2001/XMLSchema#',
        challenge: 'sec:challenge',
        created: { '@id': 'http://purl.org/dc/terms/created', '@type': 'xsd:dateTime' },
        domain: 'sec:domain',
        expires: { '@id': 'sec:expiration', '@type': 'xsd:dateTime' },
        jws: 'sec:jws',
        nonce: 'sec:nonce',
        proofPurpose: {
          '@id': 'sec:proofPurpose',
          '@type': '@vocab',
          '@context': {
            '@version': 1.1,
            '@protected': true,
            id: '@id',
            type: '@type',
            sec: 'https://w3id.org/security#',
            assertionMethod: { '@id': 'sec:assertionMethod', '@type': '@id', '@container': '@set' },
            authentication: { '@id': 'sec:authenticationMethod', '@type': '@id', '@container': '@set' },
          },
        },
        proofValue: 'sec:proofValue',
        verificationMethod: { '@id': 'sec:verificationMethod', '@type': '@id' },
      },
    },
    Ed25519Signature2018: {
      '@id': 'https://w3id.org/security#Ed25519Signature2018',
      '@context': {
        '@version': 1.1,
        '@protected': true,
        id: '@id',
        type: '@type',
        sec: 'https://w3id.org/security#',
        xsd: 'http://www.w3.org/2001/XMLSchema#',
        challenge: 'sec:challenge',
        created: { '@id': 'http://purl.org/dc/terms/created', '@type': 'xsd:dateTime' },
        domain: 'sec:domain',
        expires: { '@id': 'sec:expiration', '@type': 'xsd:dateTime' },
        jws: 'sec:jws',
        nonce: 'sec:nonce',
        proofPurpose: {
          '@id': 'sec:proofPurpose',
          '@type': '@vocab',
          '@context': {
            '@version': 1.1,
            '@protected': true,
            id: '@id',
            type: '@type',
            sec: 'https://w3id.org/security#',
            assertionMethod: { '@id': 'sec:assertionMethod', '@type': '@id', '@container': '@set' },
            authentication: { '@id': 'sec:authenticationMethod', '@type': '@id', '@container': '@set' },
          },
        },
        proofValue: 'sec:proofValue',
        verificationMethod: { '@id': 'sec:verificationMethod', '@type': '@id' },
      },
    },
    RsaSignature2018: {
      '@id': 'https://w3id.org/security#RsaSignature2018',
      '@context': {
        '@version': 1.1,
        '@protected': true,
        challenge: 'sec:challenge',
        created: { '@id': 'http://purl.org/dc/terms/created', '@type': 'xsd:dateTime' },
        domain: 'sec:domain',
        expires: { '@id': 'sec:expiration', '@type': 'xsd:dateTime' },
        jws: 'sec:jws',
        nonce: 'sec:nonce',
        proofPurpose: {
          '@id': 'sec:proofPurpose',
          '@type': '@vocab',
          '@context': {
            '@version': 1.1,
            '@protected': true,
            id: '@id',
            type: '@type',
            sec: 'https://w3id.org/security#',
            assertionMethod: { '@id': 'sec:assertionMethod', '@type': '@id', '@container': '@set' },
            authentication: { '@id': 'sec:authenticationMethod', '@type': '@id', '@container': '@set' },
          },
        },
        proofValue: 'sec:proofValue',
        verificationMethod: { '@id': 'sec:verificationMethod', '@type': '@id' },
      },
    },
    proof: { '@id': 'https://w3id.org/security#proof', '@type': '@id', '@container': '@graph' },
  },
}

const CITIZENSHIP_V1 = {
  '@context': {
    '@version': 1.1,
    '@protected': true,
    name: 'http://schema.org/name',
    description: 'http://schema.org/description',
    identifier: 'http://schema.org/identifier',
    image: { '@id': 'http://schema.org/image', '@type': '@id' },
    PermanentResidentCard: {
      '@id': 'https://w3id.org/citizenship#PermanentResidentCard',
      '@context': {
        '@version': 1.1,
        '@protected': true,
        id: '@id',
        type: '@type',
        description: 'http://schema.org/description',
        name: 'http://schema.org/name',
        identifier: 'http://schema.org/identifier',
        image: { '@id': 'http://schema.org/image', '@type': '@id' },
      },
    },
    PermanentResident: {
      '@id': 'https://w3id.org/citizenship#PermanentResident',
      '@context': {
        '@version': 1.1,
        '@protected': true,
        id: '@id',
        type: '@type',
        ctzn: 'https://w3id.org/citizenship#',
        schema: 'http://schema.org/',
        xsd: 'http://www.w3.org/2001/XMLSchema#',
        birthCountry: 'ctzn:birthCountry',
        birthDate: { '@id': 'schema:birthDate', '@type': 'xsd:dateTime' },
        commuterClassification: 'ctzn:commuterClassification',
        familyName: 'schema:familyName',
        gender: 'schema:gender',
        givenName: 'schema:givenName',
        lprCategory: 'ctzn:lprCategory',
        lprNumber: 'ctzn:lprNumber',
        residentSince: { '@id': 'ctzn:residentSince', '@type': 'xsd:dateTime' },
      },
    },
    Person: 'http://schema.org/Person',
  },
}

const DID_V1 = {
  '@context': {
    '@protected': true,
    id: '@id',
    type: '@type',
    alsoKnownAs: { '@id': 'https://www.w3.org/ns/activitystreams#alsoKnownAs', '@type': '@id' },
    assertionMethod: { '@id': 'https://w3id.org/security#assertionMethod', '@type': '@id', '@container': '@set' },
    authentication: { '@id': 'https://w3id.org/security#authenticationMethod', '@type': '@id', '@container': '@set' },
    capabilityDelegation: {
      '@id': 'https://w3id.org/security#capabilityDelegationMethod',
      '@type': '@id',
      '@container': '@set',
    },
    capabilityInvocation: {
      '@id': 'https://w3id.org/security#capabilityInvocationMethod',
      '@type': '@id',
      '@container': '@set',
    },
    controller: { '@id': 'https://w3id.org/security#controller', '@type': '@id' },
    keyAgreement: { '@id': 'https://w3id.org/security#keyAgreementMethod', '@type': '@id', '@container': '@set' },
    service: {
      '@id': 'https://www.w3.org/ns/did#service',
      '@type': '@id',
      '@context': {
        '@protected': true,
        id: '@id',
        type: '@type',
        serviceEndpoint: { '@id': 'https://www.w3.org/ns/did#serviceEndpoint', '@type': '@id' },
      },
    },
    verificationMethod: { '@id': 'https://w3id.org/security#verificationMethod' },
  },
}

const SECP256K1_V1 = {
  '@context': {
    id: '@id',
    type: '@type',
    '@protected': true,
    proof: { '@id': 'https://w3id.org/security#proof', '@type': '@id', '@container': '@graph' },
    EcdsaSecp256k1VerificationKey2019: {
      '@id': 'https://w3id.org/security#EcdsaSecp256k1VerificationKey2019',
      '@context': {
        '@protected': true,
        id: '@id',
        type: '@type',
        controller: { '@id': 'https://w3id.org/security#controller', '@type': '@id' },
        revoked: { '@id': 'https://w3id.org/security#revoked', '@type': 'http://www.w3.org/2001/XMLSchema#dateTime' },
        blockchainAccountId: { '@id': 'https://w3id.org/security#blockchainAccountId' },
        publicKeyJwk: { '@id': 'https://w3id.org/security#publicKeyJwk', '@type': '@json' },
        publicKeyBase58: { '@id': 'https://w3id.org/security#publicKeyBase58' },
        publicKeyMultibase: {
          '@id': 'https://w3id.org/security#publicKeyMultibase',
          '@type': 'https://w3id.org/security#multibase',
        },
      },
    },
    EcdsaSecp256k1Signature2019: {
      '@id': 'https://w3id.org/security#EcdsaSecp256k1Signature2019',
      '@context': {
        '@protected': true,
        id: '@id',
        type: '@type',
        challenge: 'https://w3id.org/security#challenge',
        created: { '@id': 'http://purl.org/dc/terms/created', '@type': 'http://www.w3.org/2001/XMLSchema#dateTime' },
        domain: 'https://w3id.org/security#domain',
        expires: {
          '@id': 'https://w3id.org/security#expiration',
          '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
        },
        nonce: 'https://w3id.org/security#nonce',
        proofPurpose: {
          '@id': 'https://w3id.org/security#proofPurpose',
          '@type': '@vocab',
          '@context': {
            '@protected': true,
            id: '@id',
            type: '@type',
            assertionMethod: { '@id': 'https://w3id.org/security#assertionMethod', '@type': '@id', '@container': '@set' },
            authentication: {
              '@id': 'https://w3id.org/security#authenticationMethod',
              '@type': '@id',
              '@container': '@set',
            },
            capabilityInvocation: {
              '@id': 'https://w3id.org/security#capabilityInvocationMethod',
              '@type': '@id',
              '@container': '@set',
            },
            capabilityDelegation: {
              '@id': 'https://w3id.org/security#capabilityDelegationMethod',
              '@type': '@id',
              '@container': '@set',
            },
            keyAgreement: {
              '@id': 'https://w3id.org/security#keyAgreementMethod',
              '@type': '@id',
              '@container': '@set',
            },
          },
        },
        jws: { '@id': 'https://w3id.org/security#jws' },
        verificationMethod: { '@id': 'https://w3id.org/security#verificationMethod', '@type': '@id' },
      },
    },
  },
}

const DOCUMENTS: Record<string, unknown> = {
  'https://www.w3.org/2018/credentials/v1': CREDENTIALS_V1,
  'https://w3id.org/citizenship/v1': CITIZENSHIP_V1,
  'https://w3id.org/did/v1': DID_V1,
  'https://www.w3.org/ns/did/v1': DID_V1,
  'https://w3.org/ns/did/v1': DID_V1,
  'https://w3id.org/security/suites/secp256k1-2019/v1': SECP256K1_V1,
}

export const customDocumentLoader = (agentContext: AgentContext) => {
  const didResolver = agentContext.dependencyManager.resolve(DidResolverService)

  async function loader(url: string) {
    let result = DOCUMENTS[url]

    if (!result) {
      const withoutFragment = url.split('#')[0]
      result = DOCUMENTS[withoutFragment]
    }

    if (!result && isDid(url)) {
      const resolution = await didResolver.resolve(agentContext, url)
      if (resolution.didResolutionMetadata.error || !resolution.didDocument) {
        throw new CredoError(`Unable to resolve DID: ${url}`)
      }
      result = await jsonld.frame(
        resolution.didDocument.toJSON(),
        {
          '@context': resolution.didDocument.context,
          '@embed': '@never',
          id: url,
        },
        // @ts-expect-error documentLoader type
        { documentLoader: loader }
      )
    }

    if (!result) {
      throw new CredoError(`Document not found: ${url}`)
    }

    return {
      contextUrl: null,
      documentUrl: url,
      document: result as JsonObject,
    }
  }

  return loader.bind(loader)
}
