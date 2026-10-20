import type { Response } from 'express'
import logger from '../logger'
import type { DidDocument } from './did-doc'

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : JSON.stringify(error))

export const serverError = (res: Response, label: string, error: unknown): void => {
  const message = errorMessage(error)
  logger.error(`${label} Error- ${message}`)
  res.status(500).json({ success: false, message })
}

/**
 * Accepts a DID document either as an object or as a JSON encoded string and
 * always returns an object, so the registrar never receives a double encoded document.
 */
export const parseDidDocument = (value: unknown): DidDocument | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  if (typeof value === 'string') {
    return JSON.parse(value) as DidDocument
  }
  return value as DidDocument
}

/**
 * Serialises the ethers transaction response returned by the registrar to its hash.
 */
export const transactionHashOf = (txnHash: unknown): unknown => {
  if (typeof txnHash === 'object' && txnHash !== null && 'hash' in txnHash) {
    return (txnHash as { hash: unknown }).hash
  }
  return txnHash
}
