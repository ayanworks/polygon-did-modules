import { getResolver } from '@ayanworks/polygon-did-resolver'
import { Resolver } from 'did-resolver'
import type { Express } from 'express'
import { config } from '../config'
import logger from '../logger'
import { serverError } from '../utils/http'

export class ResolveDid {
  public resolver: Resolver

  public constructor() {
    this.resolver = new Resolver(
      {
        ...getResolver(config.rpcUrl, config.contractAddress),
      },
      { cache: true }
    )
  }

  public routes(app: Express): void {
    app.get('/resolve-did/:did', async (req, res) => {
      try {
        const did = req.params.did
        const returnDidDoc = await this.resolver.resolve(did)

        const didDocRes = returnDidDoc.didDocument

        res.status(200).send(didDocRes)
        logger.debug(`returnDidDoc - ${JSON.stringify(returnDidDoc)}`)
      } catch (error) {
        serverError(res, 'ResolveDid', error)
      }
    })
  }
}
