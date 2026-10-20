import DidRegistryContract from '@ayanworks/polygon-did-registry-contract'
import { Interface, JsonRpcProvider, Transaction } from 'ethers'
import type { Express } from 'express'
import { config } from '../config'
import logger from '../logger'
import { serverError } from '../utils/http'

const registryInterface = new Interface(DidRegistryContract.abi)

const ALLOWED_SELECTORS = new Set(
  ['createDID', 'updateDIDDoc']
    .map((functionName) => registryInterface.getFunction(functionName)?.selector.toLowerCase())
    .filter((selector): selector is string => Boolean(selector))
)

type BroadcastBody = {
  signedTx?: unknown
}

/**
 * Broadcasts a transaction that was signed locally by the DID controller.
 * The server only validates that it targets this registry and relays it to
 * the chain - it never holds a private key in this flow.
 */
export class Broadcast {
  private provider: JsonRpcProvider

  public constructor() {
    this.provider = new JsonRpcProvider(config.rpcUrl)
  }

  public routes(app: Express): void {
    app.post('/broadcast', async (req, res) => {
      try {
        const { signedTx } = (req.body ?? {}) as BroadcastBody

        if (!signedTx || typeof signedTx !== 'string') {
          throw new Error('signedTx is required')
        }

        let transaction: Transaction
        try {
          transaction = Transaction.from(signedTx)
        } catch {
          throw new Error('signedTx is not a valid signed transaction')
        }
        if (!transaction.from) {
          throw new Error('signedTx must be signed by the DID controller')
        }
        if (!transaction.to || transaction.to.toLowerCase() !== config.contractAddress.toLowerCase()) {
          throw new Error(`signed transaction must target the DID registry contract at ${config.contractAddress}`)
        }
        const selector = transaction.data.slice(0, 10).toLowerCase()
        if (!ALLOWED_SELECTORS.has(selector)) {
          throw new Error('signed transaction contains an unsupported method')
        }

        const transactionResponse = await this.provider.broadcastTransaction(signedTx)

        const data = { txnHash: transactionResponse.hash }
        res.status(201).json({ success: true, message: 'Transaction broadcast successfully', data })
        logger.debug(`broadcast - ${JSON.stringify(data)}`)
      } catch (error) {
        serverError(res, 'Broadcast', error)
      }
    })
  }
}
