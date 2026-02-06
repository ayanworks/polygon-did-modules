import { AskarModule, transformPrivateKeyToPrivateJwk } from '@credo-ts/askar'
import {
  Agent,
  ClaimFormat,
  ConsoleLogger,
  CredentialIssuancePurpose,
  CredoError,
  DidsModule,
  JsonTransformer,
  LogLevel,
  SignatureSuiteRegistry,
  TypedArrayEncoder,
  utils,
  VERIFICATION_METHOD_TYPE_ECDSA_SECP256K1_VERIFICATION_KEY_2019,
  vcLibraries,
  W3cCredential,
  W3cCredentialsModuleConfig,
  W3cJsonLdCredentialService,
  W3cJsonLdVerifiableCredential,
  W3cJsonLdVerifiablePresentation,
  W3cPresentation,
} from '@credo-ts/core'
import { Secp256k1PublicJwk } from '@credo-ts/core/kms'
import { agentDependencies } from '@credo-ts/node'
import { askar } from '@openwallet-foundation/askar-nodejs'
import { SigningKey } from 'ethers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PolygonDidRegistrar, PolygonDidResolver } from '../src/dids'
import { buildDid } from '../src/dids/didPolygonUtil'
import { PolygonModule } from '../src/PolygonModule'
import { EcdsaSecp256k1Signature2019 } from '../src/signature-suites'
import { customDocumentLoader } from './documentLoader'
import { EcdsaSecp256k1Signature2019Fixtures } from './fixtures'

const logger = new ConsoleLogger(LogLevel.info)

const { jsonldSignatures } = vcLibraries
const { purposes } = jsonldSignatures

const signatureSuiteRegistry = new SignatureSuiteRegistry([
  {
    suiteClass: EcdsaSecp256k1Signature2019,
    proofType: 'EcdsaSecp256k1Signature2019',
    verificationMethodTypes: [VERIFICATION_METHOD_TYPE_ECDSA_SECP256K1_VERIFICATION_KEY_2019],
    supportedPublicJwkTypes: [Secp256k1PublicJwk],
  },
])

const w3cJsonLdCredentialService = new W3cJsonLdCredentialService(
  signatureSuiteRegistry,
  new W3cCredentialsModuleConfig({
    documentLoader: customDocumentLoader
  })
)

describe('Secp256k1 W3cCredentialService', () => {
  let agent: Agent<{ askar: AskarModule; polygon: PolygonModule; dids: DidsModule; }>

  describe('Utility methods', () => {
    describe('getVerificationMethodTypesByProofType', () => {
      it('should return the correct key types for EcdsaSecp256k1Signature2019 proof type', async () => {
        const verificationMethodTypes =
          w3cJsonLdCredentialService.getVerificationMethodTypesByProofType('EcdsaSecp256k1Signature2019')
        expect(verificationMethodTypes).toEqual([VERIFICATION_METHOD_TYPE_ECDSA_SECP256K1_VERIFICATION_KEY_2019])
      })
    })
  })

  describe('EcdsaSecp256k1Signature2019', () => {
    const privateKey = TypedArrayEncoder.fromHex('5a4a2c79f4bceb4976dde41897b2607e01e6b74a42bc854a7a20059cfa99a095')
    let issuerDid: string
    let verificationMethod: string

    beforeAll(async () => {
      agent = new Agent({
        config: {
          logger,
        },
        dependencies: agentDependencies,
        modules: {
          askar: new AskarModule({ askar, store: { id: utils.uuid(), key: utils.uuid() } }),
          polygon: new PolygonModule({
            rpcUrl: 'https://rpc-amoy.polygon.technology',
            didContractAddress: '0xcB80F37eDD2bE3570c6C9D5B0888614E04E1e49E',
            fileServerToken:
              'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJBeWFuV29ya3MiLCJpZCI6IjdmYjRmN2I3LWQ5ZWUtNDYxOC04OTE4LWZiMmIzYzY1M2EyYiJ9.x-kHeTVqX4w19ibSAspCYgIL-JFVss8yZ0CT21QVRYM',
            schemaManagerContractAddress: '0x4742d43C2dFCa5a1d4238240Afa8547Daf87Ee7a',
            serverUrl: 'https://51e1-103-97-166-226.ngrok-free.app',
          }),
          dids: new DidsModule({
            resolvers: [new PolygonDidResolver()],
            registrars: [new PolygonDidRegistrar()],
          }),
        },
      })
      await agent.initialize()

      const signingKey = new SigningKey(privateKey)
      const publicKeyHex = signingKey.publicKey.substring(2) // Remove '0x' prefix
      const publicKeyBuffer = Buffer.from(publicKeyHex, 'hex')
      const publicKeyBase58 = TypedArrayEncoder.toBase58(publicKeyBuffer)

      const { privateJwk } = transformPrivateKeyToPrivateJwk({
        type: { kty: 'EC', crv: 'secp256k1' },
        privateKey: privateKey,
      })
      privateJwk.kid = publicKeyBase58

      await agent.kms.importKey({
        privateJwk,
      })

      issuerDid = buildDid('polygon', 'testnet', publicKeyHex)

      await agent.dids.import({
        did: issuerDid,
        overwrite: true,
        keys: [
          {
            didDocumentRelativeKeyId: `${issuerDid}#key-1`,
            kmsKeyId: publicKeyBase58,
          },
        ],
      })

      verificationMethod = `${issuerDid}#key-1`
    })

    afterAll(async () => {
      if (agent) {
        await agent.shutdown()
      }
    })

    describe('signCredential', () => {
      it('should return a successfully signed credential secp256k1', async () => {
        const credentialJson = EcdsaSecp256k1Signature2019Fixtures.TEST_LD_DOCUMENT
        credentialJson.issuer = issuerDid

        const credential = JsonTransformer.fromJSON(credentialJson, W3cCredential)

        const vc = await w3cJsonLdCredentialService.signCredential(agent.context, {
          format: ClaimFormat.LdpVc,
          credential,
          proofType: 'EcdsaSecp256k1Signature2019',
          verificationMethod: verificationMethod,
        })

        expect(vc).toBeInstanceOf(W3cJsonLdVerifiableCredential)
        expect(vc.issuer).toEqual(issuerDid)
        expect(Array.isArray(vc.proof)).toBe(false)
        // expect(vc.proof).toBeInstanceOf(LinkedDataProof)

        // vc.proof = vc.proof as LinkedDataProof
        // expect(vc.proof.verificationMethod).toEqual(verificationMethod)
      })

      it('should throw because of verificationMethod does not belong to this wallet', async () => {
        const credentialJson = EcdsaSecp256k1Signature2019Fixtures.TEST_LD_DOCUMENT
        credentialJson.issuer = issuerDid

        const credential = JsonTransformer.fromJSON(credentialJson, W3cCredential)

        expect(async () => {
          await w3cJsonLdCredentialService.signCredential(agent.context, {
            format: ClaimFormat.LdpVc,
            credential,
            proofType: 'EcdsaSecp256k1Signature2019',
            verificationMethod: 'did:polygon:testnet:0x4A09b8CB511cca4Ca1c5dB0475D0e07bFc96EF47#key-1',
          })
        }).rejects.toThrowError(CredoError)
      })
    })

    describe('verifyCredential', () => {
      it('should verify the credential successfully', async () => {
        const result = await w3cJsonLdCredentialService.verifyCredential(agent.context, {
          credential: JsonTransformer.fromJSON(
            EcdsaSecp256k1Signature2019Fixtures.TEST_LD_DOCUMENT_SIGNED,
            W3cJsonLdVerifiableCredential
          ),
          proofPurpose: new purposes.AssertionProofPurpose(),
        })

        expect(result.isValid).toEqual(true)
      })

      it('should fail because of invalid signature', async () => {
        const vc = JsonTransformer.fromJSON(
          EcdsaSecp256k1Signature2019Fixtures.TEST_LD_DOCUMENT_BAD_SIGNED,
          W3cJsonLdVerifiableCredential
        )
        const result = await w3cJsonLdCredentialService.verifyCredential(agent.context, { credential: vc })

        expect(result).toEqual({
          isValid: false,
          error: expect.any(Error),
          validations: {
            vcJs: {
              error: expect.any(Error),
              isValid: false,
              results: expect.any(Array),
            },
          },
        })
      })
    })

    describe('signPresentation', () => {
      it('should successfully create a presentation from single verifiable credential', async () => {
        const presentation = JsonTransformer.fromJSON(
          EcdsaSecp256k1Signature2019Fixtures.TEST_VP_DOCUMENT,
          W3cPresentation
        )

        const purpose = new CredentialIssuancePurpose({
          controller: {
            id: verificationMethod,
          },
          date: new Date().toISOString(),
        })

        const verifiablePresentation = await w3cJsonLdCredentialService.signPresentation(agent.context, {
          format: ClaimFormat.LdpVp,
          presentation: presentation,
          proofPurpose: purpose,
          proofType: 'EcdsaSecp256k1Signature2019',
          challenge: '7bf32d0b-39d4-41f3-96b6-45de52988e4c',
          domain: 'issuer.example.com',
          verificationMethod: verificationMethod,
        })

        expect(verifiablePresentation).toBeInstanceOf(W3cJsonLdVerifiablePresentation)
      })
    })

    describe('verifyPresentation', () => {
      it('should successfully verify a presentation containing a single verifiable credential', async () => {
        const vp = JsonTransformer.fromJSON(
          EcdsaSecp256k1Signature2019Fixtures.TEST_VP_DOCUMENT_SIGNED,
          W3cJsonLdVerifiablePresentation
        )

        const result = await w3cJsonLdCredentialService.verifyPresentation(agent.context, {
          presentation: vp,
          challenge: '7bf32d0b-39d4-41f3-96b6-45de52988e4c',
        })

        expect(result).toEqual({
          isValid: true,
          error: undefined,
          validations: {
            vcJs: {
              isValid: true,
              presentationResult: expect.any(Object),
              credentialResults: expect.any(Array),
            },
          },
        })
      })

      it('should fail when presentation signature is not valid', async () => {
        const vp = JsonTransformer.fromJSON(
          {
            ...EcdsaSecp256k1Signature2019Fixtures.TEST_VP_DOCUMENT_SIGNED,
            proof: {
              ...EcdsaSecp256k1Signature2019Fixtures.TEST_VP_DOCUMENT_SIGNED.proof,
              jws: EcdsaSecp256k1Signature2019Fixtures.TEST_VP_DOCUMENT_SIGNED.proof.jws + 'a',
            },
          },
          W3cJsonLdVerifiablePresentation
        )

        const result = await w3cJsonLdCredentialService.verifyPresentation(agent.context, {
          presentation: vp,
          challenge: '7bf32d0b-39d4-41f3-96b6-45de52988e4c',
        })

        expect(result).toEqual({
          isValid: false,
          error: expect.any(Error),
          validations: {
            vcJs: {
              isValid: false,
              credentialResults: expect.any(Array),
              presentationResult: expect.any(Object),
              error: expect.any(Error),
            },
          },
        })
      })
    })
  })
})
