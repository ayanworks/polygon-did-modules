import { PolygonDID } from '@ayanworks/polygon-did-registrar'
import { SigningKey } from 'ethers'
import type { Express } from 'express'
import { config } from '../config'
import logger from '../logger'
import { buildDidDocument, deriveKeyDetails, normalizePrivateKey } from '../utils/did-doc'
import { parseDidDocument, serverError, transactionHashOf } from '../utils/http'

type RegisterDidBody = {
  did?: string
  privateKey?: string
  didDoc?: unknown
}

export class RegisterDid {
  public routes(app: Express): void {
    app.post('/register-did', async (req, res) => {
      try {
        const { did, privateKey, didDoc } = req.body as RegisterDidBody

        if (!did) {
          throw new Error('did is required')
        }
        if (!privateKey) {
          throw new Error('privateKey is required')
        }

        // The document is built from the private key when the caller does not supply one,
        // which keeps the original `POST /register-did {did, privateKey}` contract working.
        const document = parseDidDocument(didDoc) ?? buildDidDocument(did, deriveKeyDetails(privateKey).publicKeyBase58)

        const registrar = new PolygonDID({
          contractAddress: config.contractAddress,
          rpcUrl: config.rpcUrl,
          signingKey: new SigningKey(normalizePrivateKey(privateKey)),
        })
        const registerDidRes = await registrar.create(did, document)

        const data = { did: registerDidRes.did, txnHash: transactionHashOf(registerDidRes.txnHash) }
        res.status(201).json({ success: true, message: 'DID registered successfully', data })
        logger.debug(`registerDidRes - ${JSON.stringify(data)}`)
      } catch (error) {
        serverError(res, 'RegisterDid', error)
      }
    })
  }
}
