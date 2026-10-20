import '@openwallet-foundation/askar-nodejs'
import { PolygonDidRegistrar, PolygonDidResolver, PolygonModule } from '@ayanworks/credo-polygon-w3c-module'
import { AskarModule, transformPrivateKeyToPrivateJwk } from '@credo-ts/askar'
import { Agent, ConsoleLogger, DidsModule, LogLevel, TypedArrayEncoder, utils } from '@credo-ts/core'
import { agentDependencies } from '@credo-ts/node'
import { askar } from '@openwallet-foundation/askar-nodejs'
import { SigningKey } from 'ethers'
import { config } from '../config'

const logger = new ConsoleLogger(LogLevel.Error)

export type CredoDemoAgent = Agent<{
  askar: AskarModule
  polygon: PolygonModule
  dids: DidsModule
}>

let agentInstance: CredoDemoAgent | null = null

export const getDemoAgent = async (privateKeyHex?: string): Promise<CredoDemoAgent> => {
  if (agentInstance) {
    return agentInstance
  }

  const walletId = utils.uuid()
  const walletKey = utils.uuid()

  const agent = new Agent({
    config: { logger },
    dependencies: agentDependencies,
    modules: {
      askar: new AskarModule({
        askar,
        store: { id: walletId, key: walletKey },
      }),
      polygon: new PolygonModule({
        rpcUrl: config.rpcUrl,
        didContractAddress: config.contractAddress,
        fileServerToken: config.fileServerToken,
        schemaManagerContractAddress: config.schemaManagerContractAddress,
        serverUrl: config.serverUrl,
      }),
      dids: new DidsModule({
        resolvers: [new PolygonDidResolver()],
        registrars: [new PolygonDidRegistrar()],
      }),
    },
  })

  await agent.initialize()

  // If a private key is provided, import it so we can work with DIDs that need signing
  if (privateKeyHex) {
    try {
      const privateKey = TypedArrayEncoder.fromHex(
        privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex
      )
      const signingKey = new SigningKey(privateKey)
      const publicKeyHex = signingKey.compressedPublicKey.substring(2)
      const publicKeyBuffer = Buffer.from(publicKeyHex, 'hex')
      const publicKeyBase58 = TypedArrayEncoder.toBase58(publicKeyBuffer)

      const { privateJwk } = transformPrivateKeyToPrivateJwk({
        type: { kty: 'EC', crv: 'secp256k1' },
        privateKey,
      })
      privateJwk.kid = publicKeyBase58

      try {
        await agent.kms.importKey({ privateJwk })
      } catch (_e) {
        // Key might already exist, ignore
      }
    } catch (_e) {
      // Ignore import errors for demo
    }
  }

  agentInstance = agent as CredoDemoAgent
  return agentInstance
}

export const shutdownDemoAgent = async (): Promise<void> => {
  if (agentInstance) {
    await agentInstance.shutdown()
    agentInstance = null
  }
}
