import { AskarModule, transformPrivateKeyToPrivateJwk } from '@credo-ts/askar'
import { Agent, ConsoleLogger, DidsModule, LogLevel, TypedArrayEncoder, utils } from '@credo-ts/core'
import { type DidCommEncryptedMessage } from '@credo-ts/didcomm'
import { agentDependencies } from '@credo-ts/node'
import { askar } from '@openwallet-foundation/askar-nodejs'
import { SigningKey } from 'ethers'
import { Subject } from 'rxjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PolygonDidRegistrar, PolygonDidResolver } from '../src/dids'
import { PolygonModule } from '../src/PolygonModule'

import { PolygonDIDFixtures } from './fixtures'

const logger = new ConsoleLogger(LogLevel.info)

export type SubjectMessage = { message: DidCommEncryptedMessage; replySubject?: Subject<SubjectMessage> }

const did = 'did:polygon:testnet:0x138d2231e4362fc0e028576Fb2DF56904bd59C1b'

describe('Polygon Module did resolver', () => {
  let aliceAgent: Agent<{ askar: AskarModule; polygon: PolygonModule; dids: DidsModule }>
  let aliceWalletId: string
  let aliceWalletKey: string

  beforeAll(async () => {
    aliceWalletId = utils.uuid()
    aliceWalletKey = utils.uuid()

    // Initialize alice
    aliceAgent = new Agent({
      config: {
        logger,
      },
      dependencies: agentDependencies,
      modules: {
        askar: new AskarModule({ askar, store: { id: aliceWalletId, key: aliceWalletKey } }),
        // Add required modules
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
    await aliceAgent.initialize()

    const privateKey = TypedArrayEncoder.fromHex('5a4a2c79f4bceb4976dde41897b2607e01e6b74a42bc854a7a20059cfa99a095')

    // Calculate publicKeyBase58 from private key (same as in PolygonDidRegistrar)
    const signingKey = new SigningKey(privateKey)
    const publicKeyHex = signingKey.publicKey.substring(2) // Remove '0x' prefix
    const publicKeyBuffer = Buffer.from(publicKeyHex, 'hex')
    const publicKeyBase58 = TypedArrayEncoder.toBase58(publicKeyBuffer)

    const { privateJwk } = transformPrivateKeyToPrivateJwk({
      type: { kty: 'EC', crv: 'secp256k1' },
      privateKey: privateKey,
    })
    privateJwk.kid = publicKeyBase58

    await aliceAgent.kms.importKey({
      privateJwk,
    })

    await aliceAgent.dids.import({
      did,
      overwrite: true,
      keys: [
        {
          didDocumentRelativeKeyId: `${did}#key-1`,
          kmsKeyId: publicKeyBase58,
        },
      ],
    })
  })

  afterAll(async () => {
    // Wait for messages to flush out
    await new Promise((r) => setTimeout(r, 1000))

    if (aliceAgent) {
      await aliceAgent.shutdown()
    }
  })

  // it('create and resolve a did:polygon did', async () => {
  //   const createdDid = await aliceAgent.dids.create<PolygonDidCreateOptions>({
  //     method: 'polygon',
  //     options: {
  //       network: 'testnet',
  //       endpoint: 'https://example.com',
  //     },
  //     secret: {
  //       privateKey: TypedArrayEncoder.fromHex('89d6e6df0272c4262533f951d0550ecd9f444ec2e13479952e4cc6982febfed6'),
  //     },
  //   })

  //   console.log('createdDid', createdDid)
  // })

  describe('PolygonDidResolver', () => {
    it('should resolve a polygon did when valid did is passed', async () => {
      const resolvedDIDDoc = await aliceAgent.dids.resolve(did)
      expect(resolvedDIDDoc.didDocument?.context).toEqual(PolygonDIDFixtures.VALID_DID_DOCUMENT.didDocument['@context'])
      expect(resolvedDIDDoc.didDocument?.id).toBe(PolygonDIDFixtures.VALID_DID_DOCUMENT.didDocument.id)
      expect(resolvedDIDDoc.didDocument?.verificationMethod).toEqual(
        PolygonDIDFixtures.VALID_DID_DOCUMENT.didDocument.verificationMethod
      )
      expect(resolvedDIDDoc.didDocument?.authentication).toEqual(
        PolygonDIDFixtures.VALID_DID_DOCUMENT.didDocument.authentication
      )
      expect(resolvedDIDDoc.didDocument?.assertionMethod).toEqual(
        PolygonDIDFixtures.VALID_DID_DOCUMENT.didDocument.assertionMethod
      )
    })

    it("should fail with 'Invalid DID' message when invalid polygon did is passed", async () => {
      const did = 'did:polygon:testnet:0x525D4605f4EE59e1149987F59668D4f272359093'

      const result = await aliceAgent.dids.resolve(did)

      expect(result.didResolutionMetadata.error).toBe('notFound')
      expect(result.didResolutionMetadata.message).toContain('resolver_error: Unable to resolve did')
    })

    it('should fail after resolution invalid polygon did is passed', async () => {
      const did = 'did:polygon:testnet:0x525D4605f4EE59e1149987F59668D4f272359093'

      const result = await aliceAgent.dids.resolve(did)

      expect(result.didDocument).toEqual(null)
      expect(result.didResolutionMetadata.error).toEqual('notFound')
    })
  })
})
