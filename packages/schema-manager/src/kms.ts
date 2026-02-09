import type { JsonRpcApiProvider, Provider, TransactionRequest, TypedDataDomain, TypedDataField } from 'ethers'
import { AbstractSigner, assert, ethers, Signature, toUtf8Bytes } from 'ethers'
import type { GenericSigner } from './signer'
import { SignerError } from './signer'

export class KMSSigner extends AbstractSigner<JsonRpcApiProvider> {
  constructor(
    provider: JsonRpcApiProvider,
    private signer: GenericSigner,
    public userAddress: string
  ) {
    super(provider)
  }

  connect(_provider: null | Provider): ethers.Signer {
    assert(false, 'cannot reconnect JsonRpcSigner', 'UNSUPPORTED_OPERATION', {
      operation: 'signer.connect',
    })
  }

  async getAddress(): Promise<string> {
    return this.userAddress
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    const messageBytes = typeof message === 'string' ? toUtf8Bytes(message) : message
    const hash = ethers.hashMessage(messageBytes)
    const signatureHex = await this.signer.sign(ethers.getBytes(hash))

    // Parse the signature and return serialized form
    const sig = Signature.from(signatureHex)
    return sig.serialized
  }

  async signTransaction(tx: TransactionRequest): Promise<string> {
    try {
      // Populate transaction with necessary fields (nonce, gas, etc.)
      const populated = await this.populateTransaction(tx)

      // Validate from address if provided
      if (populated.from) {
        const fromAddress = await ethers.resolveAddress(populated.from, this)
        const signerAddress = await this.getAddress()
        if (fromAddress.toLowerCase() !== signerAddress.toLowerCase()) {
          throw new SignerError(
            `Transaction from address mismatch. Expected: ${signerAddress}, Got: ${fromAddress}`,
            'SIGNING_FAILED'
          )
        }
      }

      // Build the transaction
      const btx = ethers.Transaction.from(populated as ethers.TransactionLike<string>)

      // Sign the unsigned hash
      const signatureHex = await this.signer.sign(ethers.getBytes(btx.unsignedHash))

      // Parse the signature and assign to transaction
      btx.signature = Signature.from(signatureHex)

      // Return the serialized signed transaction
      return btx.serialized
    } catch (error) {
      if (error instanceof SignerError) {
        throw error
      }
      throw new SignerError(
        `Failed to sign transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SIGNING_FAILED'
      )
    }
  }

  async signTypedData(
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>
  ): Promise<string> {
    const hash = ethers.TypedDataEncoder.hash(domain, types, value)
    const signatureHex = await this.signer.sign(ethers.getBytes(hash))

    // Parse the signature and return serialized form
    const sig = Signature.from(signatureHex)
    return sig.serialized
  }
}
