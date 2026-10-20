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
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error('didDoc is not valid JSON')
    }
    // A JSON scalar ('"x"', '5', 'true') parses fine but is not a document.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('didDoc must be a JSON object')
    }
    return parsed as DidDocument
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('didDoc must be a JSON object')
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
