import DidRegistryContract from '@ayanworks/polygon-did-registry-contract'
import { getResolver, parseDid, validateDid } from '@ayanworks/polygon-did-resolver'
import { Resolver } from 'did-resolver'
import { Interface, JsonRpcProvider, toBeHex } from 'ethers'
import type { Express } from 'express'
import { config } from '../config'
import logger from '../logger'
import { parseDidDocument, serverError } from '../utils/http'

const registryInterface = new Interface(DidRegistryContract.abi)

const INTENT_OPERATIONS = ['create', 'update'] as const

type TxIntentBody = {
  operation?: string
  did?: string
  didDoc?: unknown
}

/**
 * Builds the unsigned transaction (calldata, nonce, fees, gas) for a DID document
 * create or update. The API never sees a private key in this flow - the caller
 * signs the returned transaction locally and submits it via POST /broadcast.
 */
export class TxIntent {
  private provider: JsonRpcProvider
  private resolver: Resolver

  public constructor() {
    this.provider = new JsonRpcProvider(config.rpcUrl)
    this.resolver = new Resolver(getResolver(config.rpcUrl, config.contractAddress))
  }

  public routes(app: Express): void {
    app.post('/tx-intent', async (req, res) => {
      try {
        const { operation, did, didDoc } = (req.body ?? {}) as TxIntentBody

        if (!operation || !INTENT_OPERATIONS.some((candidate) => candidate === operation)) {
          throw new Error('operation must be either create or update')
        }
        if (!did) {
          throw new Error('did is required')
        }
        if (!validateDid(did)) {
          throw new Error('invalid did provided')
        }

        const document = parseDidDocument(didDoc)
        if (!document) {
          throw new Error('didDoc is required')
        }

        // Mirror the checks of the custodial registrar so both flows report the same errors.
        const didDetails = await this.resolver.resolve(did)
        if (operation === 'create' && didDetails.didDocument) {
          throw new Error('The DID document already registered!')
        }
        if (operation === 'update' && !didDetails.didDocument) {
          throw new Error('The DID document for the given DID was not found!')
        }

        const { didAddress } = parseDid(did, { rpcUrl: config.rpcUrl, contractAddress: config.contractAddress })
        const functionName = operation === 'create' ? 'createDID' : 'updateDIDDoc'
        const data = registryInterface.encodeFunctionData(functionName, [didAddress, JSON.stringify(document)])

        const [network, nonce, feeData] = await Promise.all([
          this.provider.getNetwork(),
          this.provider.getTransactionCount(didAddress, 'pending'),
          this.provider.getFeeData(),
        ])
        const gasLimit = await this.provider.estimateGas({ from: didAddress, to: config.contractAddress, data })

        const unsignedTransaction = {
          operation,
          from: didAddress,
          to: config.contractAddress,
          data,
          value: '0x0',
          nonce: toBeHex(nonce),
          chainId: toBeHex(network.chainId),
          gasLimit: toBeHex(gasLimit),
          maxFeePerGas: feeData.maxFeePerGas ? toBeHex(feeData.maxFeePerGas) : null,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? toBeHex(feeData.maxPriorityFeePerGas) : null,
        }

        res
          .status(200)
          .json({ success: true, message: 'Transaction intent created successfully', data: unsignedTransaction })
        logger.debug(`txIntent - ${JSON.stringify(unsignedTransaction)}`)
      } catch (error) {
        serverError(res, 'TxIntent', error)
      }
    })
  }
}
