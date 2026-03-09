import { getResolver } from '@ayanworks/polygon-did-resolver'
import {
  type AgentContext,
  DidDocument,
  type DidResolutionResult,
  type DidResolver,
  JsonTransformer,
} from '@credo-ts/core'
import { Resolver } from 'did-resolver'
import { PolygonModuleConfig } from '../PolygonModuleConfig'
import { isValidPolygonDid } from './didPolygonUtil'

export class PolygonDidResolver implements DidResolver {
  public readonly allowsCaching = true

  private resolver?: Resolver

  public readonly supportedMethods = ['polygon']

  public async resolve(agentContext: AgentContext, did: string): Promise<DidResolutionResult> {
    const didDocumentMetadata = {}

    if (!isValidPolygonDid(did)) {
      throw new Error('Invalid DID')
    }
    try {
      const resolver = this._getResolver(agentContext)
      const { didDocument, didDocumentMetadata, didResolutionMetadata } = await resolver.resolve(did)

      return {
        didDocument: JsonTransformer.fromJSON(didDocument, DidDocument),
        didDocumentMetadata,
        didResolutionMetadata,
      }
    } catch (error) {
      return {
        didDocument: null,
        didDocumentMetadata,
        didResolutionMetadata: {
          error: 'notFound',
          message: `resolver_error: Unable to resolve did '${did}': ${error}`,
        },
      }
    }
  }

  private _getResolver(agentContext: AgentContext) {
    if (!this.resolver) {
      const polygonOptions = agentContext.dependencyManager.resolve(PolygonModuleConfig)

      this.resolver = new Resolver(getResolver(polygonOptions.rpcUrl, polygonOptions.didContractAddress))
    }

    return this.resolver
  }
}
