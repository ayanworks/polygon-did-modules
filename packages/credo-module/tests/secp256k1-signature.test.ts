import '@openwallet-foundation/askar-nodejs'
import { AskarModule, transformPrivateKeyToPrivateJwk } from '@credo-ts/askar'
import {
  Agent,
  ClaimFormat,
  ConsoleLogger,
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
import {
  EcdsaSecp256k1Signature2019Fixtures,
  TEST_ISSUER_DID,
  TEST_PRIVATE_KEY_HEX,
  TEST_VERIFICATION_METHOD,
} from './fixtures'

const logger = new ConsoleLogger(LogLevel.Info)

const { jsonldSignatures } = vcLibraries
const { purposes } = jsonldSignatures

const CHALLENGE = '7bf32d0b-39d4-41f3-96b6-45de52988e4c'
const DOMAIN = 'issuer.example.com'

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
    documentLoader: customDocumentLoader,
  })
)

/** Serialise a signed credential/presentation back to plain JSON so it can be re-parsed. */
const toJson = (value: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(value))

/**
 * Flip the last character of the detached JWS signature. The signature no longer
 * matches the payload, so verification must fail for the signature and not for
 * some unrelated reason such as an unresolvable verification method.
 */
const tamperWithJws = <T extends { proof: unknown }>(document: T): T => {
  const json = toJson(document) as T & { proof: { jws: string } | Array<{ jws: string }> }
  const proof = Array.isArray(json.proof) ? json.proof[0] : json.proof
  proof.jws = `${proof.jws.slice(0, -1)}${proof.jws.endsWith('A') ? 'B' : 'A'}`

  return json as unknown as T
}

describe('Secp256k1 W3cCredentialService', () => {
  let agent: Agent<{ askar: AskarModule; polygon: PolygonModule; dids: DidsModule }>

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
    let issuerDid: string
    let verificationMethod: string

    // Signed at runtime rather than checked in. The previous hardcoded fixtures
    // were signed by the holder of a live on-chain DID and carried the invalid
    // `alg: "EcDSA"` JWS header, so they could neither be regenerated here nor
    // verified by Credo 0.7. Signing with the deterministic test key keeps the
    // suite self-contained.
    let signedCredential: W3cJsonLdVerifiableCredential
    let signedPresentation: W3cJsonLdVerifiablePresentation

    beforeAll(async () => {
      agent = new Agent({
        config: {
          logger,
        },
        dependencies: agentDependencies,
        modules: {
          askar: new AskarModule({
            askar,
            store: {
              id: utils.uuid(),
              key: utils.uuid(),
            },
          }),
          polygon: new PolygonModule({
            rpcUrl: 'https://polygon-amoy-bor-rpc.publicnode.com',
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

      const privateKey = TypedArrayEncoder.fromHex(TEST_PRIVATE_KEY_HEX)
      const signingKey = new SigningKey(privateKey)
      // x || y, uncompressed and without the SEC1 prefix. This is what
      // PolygonDidRegistrar passes to buildDid, and using the x-coordinate alone
      // would derive a different address.
      const publicKeyHex = signingKey.publicKey.substring(2)
      // The KMS key id is base58 of the 32-byte x-coordinate, matching
      // PolygonDidRegistrar.importKeyToKms.
      const publicKeyBase58 = TypedArrayEncoder.toBase58(
        TypedArrayEncoder.fromHex(signingKey.compressedPublicKey.substring(2))
      )

      const { privateJwk } = transformPrivateKeyToPrivateJwk({
        type: { kty: 'EC', crv: 'secp256k1' },
        privateKey: privateKey,
      })
      privateJwk.kid = publicKeyBase58

      await agent.kms.importKey({
        privateJwk,
      })

      issuerDid = buildDid('polygon', 'testnet', publicKeyHex)
      // Guard against the fixtures drifting away from the key used here.
      expect(issuerDid).toBe(TEST_ISSUER_DID)

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
      expect(verificationMethod).toBe(TEST_VERIFICATION_METHOD)

      const credentialJson = {
        ...EcdsaSecp256k1Signature2019Fixtures.TEST_LD_DOCUMENT,
        issuer: issuerDid,
      }
      const cs = credentialJson.credentialSubject as Record<string, unknown>
      const { id, ...restCs } = cs
      credentialJson.credentialSubject = restCs

      const credential = JsonTransformer.fromJSON(credentialJson, W3cCredential)

      signedCredential = await w3cJsonLdCredentialService.signCredential(agent.context, {
        format: ClaimFormat.LdpVc,
        credential,
        proofType: 'EcdsaSecp256k1Signature2019',
        verificationMethod,
      })

      const presentation = JsonTransformer.fromJSON(
        {
          ...EcdsaSecp256k1Signature2019Fixtures.TEST_VP_DOCUMENT,
          verifiableCredential: [signedCredential],
        },
        W3cPresentation
      )
      signedPresentation = await w3cJsonLdCredentialService.signPresentation(agent.context, {
        format: ClaimFormat.LdpVp,
        presentation,
        // verifyPresentation treats the holder proof as an authentication proof
        // unless told otherwise, so sign it with a matching purpose.
        proofPurpose: new purposes.AuthenticationProofPurpose({ challenge: CHALLENGE, domain: DOMAIN }),
        proofType: 'EcdsaSecp256k1Signature2019',
        challenge: CHALLENGE,
        domain: DOMAIN,
        verificationMethod,
      })
    })

    afterAll(async () => {
      if (agent) {
        await agent.shutdown()
      }
    })

    describe('signCredential', () => {
      it('should return a successfully signed credential secp256k1', async () => {
        const vc = signedCredential

        expect(vc).toBeInstanceOf(W3cJsonLdVerifiableCredential)
        expect(vc.issuer).toEqual(issuerDid)
        expect(Array.isArray(vc.proof)).toBe(false)
        // The suite must emit the registered JWA identifier, not the legacy 'EcDSA'.
        expect(toJson(vc).proof).toMatchObject({ type: 'EcdsaSecp256k1Signature2019' })
        const [header] = (toJson(vc).proof as { jws: string }).jws.split('..')
        expect(JSON.parse(Buffer.from(header, 'base64url').toString('utf8'))).toMatchObject({ alg: 'ES256K' })
      })

      it('should throw because of verificationMethod does not belong to this wallet', async () => {
        const credentialJson = { ...EcdsaSecp256k1Signature2019Fixtures.TEST_LD_DOCUMENT, issuer: issuerDid }
        const credential = JsonTransformer.fromJSON(credentialJson, W3cCredential)

        await expect(
          w3cJsonLdCredentialService.signCredential(agent.context, {
            format: ClaimFormat.LdpVc,
            credential,
            proofType: 'EcdsaSecp256k1Signature2019',
            verificationMethod: 'did:polygon:testnet:0x4A09b8CB511cca4Ca1c5dB0475D0e07bFc96EF47#key-1',
          })
        ).rejects.toThrowError(CredoError)
      })
    })

    describe('verifyCredential', () => {
      it('should verify the credential successfully', async () => {
        const result = await w3cJsonLdCredentialService.verifyCredential(agent.context, {
          credential: JsonTransformer.fromJSON(signedCredential, W3cJsonLdVerifiableCredential),
          proofPurpose: new purposes.AssertionProofPurpose(),
        })

        expect(result).toMatchObject({
          isValid: true,
          error: undefined,
          validations: {
            vcJs: {
              isValid: true,
              results: expect.any(Array),
            },
          },
        })
      })

      it('should fail because of invalid signature', async () => {
        const vc = JsonTransformer.fromJSON(
          tamperWithJws(signedCredential),
          W3cJsonLdVerifiableCredential
        ) as W3cJsonLdVerifiableCredential

        const result = await w3cJsonLdCredentialService.verifyCredential(agent.context, { credential: vc })

        expect(result).toMatchObject({
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
        expect(signedPresentation).toBeInstanceOf(W3cJsonLdVerifiablePresentation)
        expect(toJson(signedPresentation).verifiableCredential).toBeDefined()
      })
    })

    describe('verifyPresentation', () => {
      it('should successfully verify a presentation containing a single verifiable credential', async () => {
        const vp = JsonTransformer.fromJSON(signedPresentation, W3cJsonLdVerifiablePresentation)

        const result = await w3cJsonLdCredentialService.verifyPresentation(agent.context, {
          presentation: vp,
          challenge: CHALLENGE,
        })

        expect(result).toMatchObject({
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
          tamperWithJws(signedPresentation),
          W3cJsonLdVerifiablePresentation
        ) as W3cJsonLdVerifiablePresentation

        const result = await w3cJsonLdCredentialService.verifyPresentation(agent.context, {
          presentation: vp,
          challenge: CHALLENGE,
        })

        expect(result).toMatchObject({
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
