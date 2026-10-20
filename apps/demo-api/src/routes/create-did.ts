import { PolygonDID } from '@ayanworks/polygon-did-registrar'
import type { Express } from 'express'
import logger from '../logger'
import { assertNetworkType, buildDidDocument, deriveDidDetails } from '../utils/did-doc'
import { serverError } from '../utils/http'

type CreateDidBody = {
  networkType?: string
  privateKey?: string
}

export class CreateDid {
  public routes(app: Express): void {
    app.post('/create-did', (req, res) => {
      try {
        const { networkType, privateKey } = req.body as CreateDidBody

        const network = assertNetworkType(networkType ?? '')
        const didDetails = privateKey ? deriveDidDetails(network, privateKey) : PolygonDID.createKeyPair(network)
        const didDoc = buildDidDocument(didDetails.did, didDetails.publicKeyBase58)
        const data = { ...didDetails, didDoc }

        res.status(201).json({ success: true, message: 'DID created successfully', data })
        logger.debug(`createDidRes - ${JSON.stringify(data)}`)
      } catch (error) {
        serverError(res, 'CreateDid', error)
      }
    })
  }
}
