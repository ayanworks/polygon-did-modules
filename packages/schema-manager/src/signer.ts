/**
 * Generic signer interface for signing operations
 * Designed to work with KMS and other external signing services
 */
export interface GenericSigner {
  /**
   * Sign raw data using secp256k1
   * @param data - The data to sign (typically transaction hash)
   * @returns Signature as hex string with 0x prefix (130 chars for secp256k1)
   */
  sign(data: string): Promise<string>
}

/**
 * Error thrown when signer operations fail
 */
export class SignerError extends Error {
  constructor(
    message: string,
    public readonly code: 'KMS_UNAVAILABLE' | 'SIGNING_FAILED' | 'ADDRESS_NOT_FOUND' | 'PROVIDER_REQUIRED'
  ) {
    super(message)
    this.name = 'SignerError'
  }
}
