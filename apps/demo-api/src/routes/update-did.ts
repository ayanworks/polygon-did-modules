import { PolygonDID } from '@ayanworks/polygon-did-registrar'
import { SigningKey } from 'ethers'
import type { Express } from 'express'
import { config } from '../config'
import logger from '../logger'
import { normalizePrivateKey } from '../utils/did-doc'
import { parseDidDocument, serverError, transactionHashOf } from '../utils/http'

export class UpdateDid {
  public routes(app: Express): void {
    // The private key travels in the request body, never in the URL: URLs end up
    // in proxy logs, access logs and browser history.
    app.patch('/update-did/:did', async (req, res) => {
      try {
        const did = req.params.did
        const privateKey = (req.body as { privateKey?: string }).privateKey

        if (!did) {
          throw new Error('did is required')
        }
        if (!privateKey) {
          throw new Error('privateKey is required')
        }

        const didDoc = parseDidDocument((req.body as { didDoc?: unknown }).didDoc)
        if (!didDoc) {
          throw new Error('didDoc is required')
        }

        const registrar = new PolygonDID({
          contractAddress: config.contractAddress,
          rpcUrl: config.rpcUrl,
          signingKey: new SigningKey(normalizePrivateKey(privateKey)),
        })
        const updateDidRes = await registrar.update(did, didDoc)

        const data = { did: updateDidRes.did, txnHash: transactionHashOf(updateDidRes.txnHash) }
        res.status(200).json({ success: true, message: 'DID document updated successfully', data })
        logger.debug(`updateDidRes - ${JSON.stringify(data)}`)
      } catch (error) {
        serverError(res, 'UpdateDid', error)
      }
    })
  }
}
