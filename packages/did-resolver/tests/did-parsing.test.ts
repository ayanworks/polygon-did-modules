import { describe, expect, it } from 'vitest'
import { getNetworkFromDid, parseDid, validateDid } from '../src/utils'

/**
 * Regression tests for DID parsing. `parseDid` used to accept any string and
 * fall back to the mainnet network, contract address and `didAddress:
 * undefined`, so a malformed DID resolved against the mainnet registry instead
 * of being rejected. That is a dangerous default for a value that decides which
 * network a write is sent to, so these pin the rejection behaviour instead.
 */
describe('polygon-did-resolver / did parsing', () => {
  const mainnetDid = 'did:polygon:0x794b781493AeD65b9ceBD680716fec257e118993'
  const testnetDid = 'did:polygon:testnet:0x138d2231e4362fc0e028576Fb2DF56904bd59C1b'

  describe('parseDid', () => {
    it('returns the mainnet network and address for a mainnet DID', () => {
      const parsed = parseDid(mainnetDid)
      expect(parsed.network).toBe('mainnet')
      expect(parsed.didAddress).toBe('0x794b781493AeD65b9ceBD680716fec257e118993')
    })

    it('returns the testnet network and address for a testnet DID', () => {
      const parsed = parseDid(testnetDid)
      expect(parsed.network).toBe('testnet')
      expect(parsed.didAddress).toBe('0x138d2231e4362fc0e028576Fb2DF56904bd59C1b')
    })

    it('honours rpcUrl and contractAddress overrides', () => {
      const parsed = parseDid(testnetDid, { rpcUrl: 'https://example.test', contractAddress: '0xabc' })
      expect(parsed.networkUrl).toBe('https://example.test')
      expect(parsed.contractAddress).toBe('0xabc')
    })

    // Each of these previously returned a mainnet config with
    // `didAddress: undefined` rather than throwing.
    it.each([
      ['an empty string', ''],
      ['an unrecognised string', 'nonsense'],
      ['a bare network name', 'did:polygon:testnet:'],
      ['an unknown network token', 'did:polygon:mainnet:0x794b781493AeD65b9ceBD680716fec257e118993'],
      ['a short address', 'did:polygon:testnet:0x794b781493AeD65b9ceBD680716fec257e1189'],
      ['a non-string value', undefined as unknown as string],
    ])('rejects %s instead of defaulting to mainnet', (_label, did) => {
      expect(() => parseDid(did)).toThrow('invalid did provided')
    })

    it('never returns an undefined didAddress', () => {
      expect(parseDid(mainnetDid).didAddress).toBeTruthy()
      expect(parseDid(testnetDid).didAddress).toBeTruthy()
    })
  })

  describe('getNetworkFromDid', () => {
    it('reads testnet from the network segment', () => {
      expect(getNetworkFromDid(testnetDid)).toBe('testnet')
    })

    it('reads mainnet when the network segment is the address', () => {
      expect(getNetworkFromDid(mainnetDid)).toBe('mainnet')
    })

    // Previously this returned 'mainnet' for any unrecognised token.
    it.each([
      ['an unknown network token', 'did:polygon:anything:0x794b781493AeD65b9ceBD680716fec257e118993'],
      ['a truncated DID', 'did:polygon'],
      ['an empty string', ''],
      ['a non-string value', undefined as unknown as string],
    ])('rejects %s', (_label, did) => {
      expect(() => getNetworkFromDid(did)).toThrow('invalid did provided')
    })
  })

  describe('validateDid', () => {
    it('rejects a non-string value', () => {
      expect(validateDid(undefined as unknown as string)).toBe(false)
      expect(validateDid(null as unknown as string)).toBe(false)
    })

    // The regex accepts any case so the registry, which is case-insensitive,
    // can be addressed with either checksummed or lowercase DIDs. This is
    // pinned deliberately: adding EIP-55 enforcement later is a breaking change.
    it('accepts an address in any casing', () => {
      expect(validateDid('did:polygon:testnet:0x794b781493aed65b9cebd680716fec257e118993')).toBe(true)
      expect(validateDid('did:polygon:testnet:0x794B781493AED65B9CEBD680716FEC257E118993')).toBe(true)
      expect(validateDid(mainnetDid)).toBe(true)
    })
  })
})
