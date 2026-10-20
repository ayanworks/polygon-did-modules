import type { Express } from 'express'
import logger from '../logger'
import { getDemoAgent } from '../utils/credo-agent'
import { deriveDidDetails, deriveKeyDetails } from '../utils/did-doc'
import { serverError } from '../utils/http'

type CreateSchemaBody = {
  did?: string
  privateKey?: string
  networkType?: string
  schemaName?: string
  schema?: unknown
}

export class Schemas {
  public routes(app: Express): void {
    app.post('/schemas/create', async (req, res) => {
      try {
        const { did, privateKey, networkType, schemaName, schema } = req.body as CreateSchemaBody

        if (!schemaName) {
          throw new Error('schemaName is required')
        }
        if (!schema || typeof schema !== 'object') {
          throw new Error('schema must be an object')
        }

        let didToUse = did
        const pkHex = privateKey

        if (!didToUse && privateKey && networkType) {
          const details = deriveDidDetails(networkType, privateKey)
          didToUse = details.did
        } else if (!didToUse && privateKey) {
          const keyDetails = deriveKeyDetails(privateKey)
          didToUse = `did:polygon:testnet:${keyDetails.address}`
        }

        if (!didToUse) {
          throw new Error('did or privateKey is required')
        }
        if (!pkHex) {
          throw new Error('privateKey is required to sign schema operations')
        }

        const agent = await getDemoAgent(pkHex)

        // Ensure DID is imported into the agent
        try {
          const keyDetails = deriveKeyDetails(pkHex)
          const publicKeyBase58 = keyDetails.publicKeyBase58

          await agent.dids.import({
            did: didToUse,
            overwrite: true,
            keys: [
              {
                didDocumentRelativeKeyId: `${didToUse}#key-1`,
                kmsKeyId: publicKeyBase58,
              },
            ],
          })
        } catch (_e) {
          // Ignore import errors
        }

        const result = await agent.modules.polygon.createSchema({
          did: didToUse,
          schemaName,
          schema: schema as object,
        })

        res.status(201).json({ success: true, message: 'Schema created successfully', data: result })
        logger.debug(`createSchema - ${JSON.stringify(result)}`)
      } catch (error) {
        serverError(res, 'CreateSchema', error)
      }
    })

    app.get('/schemas/:did/:schemaId', async (req, res) => {
      try {
        const { did, schemaId } = req.params

        if (!did || !schemaId) {
          throw new Error('did and schemaId are required')
        }

        const agent = await getDemoAgent()

        const result = await agent.modules.polygon.getSchemaById(did, schemaId)

        res.status(200).json({ success: true, data: result })
        logger.debug(`getSchema - ${JSON.stringify(result)}`)
      } catch (error) {
        serverError(res, 'GetSchema', error)
      }
    })
  }
}
