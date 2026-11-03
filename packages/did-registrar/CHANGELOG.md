# @ayanworks/polygon-did-registrar

## 3.0.0

### Major Changes

- 710d593: `PolygonDID.createKeyPair` now Base58-encodes the 33 compressed public-key **bytes**, matching the on-chain DID documents and `@ayanworks/polygon-did-credo-module`.

  Previously it encoded the hex **text** of the key, so `publicKeyBase58` decoded to the 68-byte ASCII string `"0x03ab..."` instead of the key itself. The value was longer than a valid key (~93 characters instead of ~44) and no verifier could use a document built from it.

  This also removes the package's only Node dependency (`Buffer`), so it now bundles and runs unchanged in browsers.

  **Migration.** Any DID registered with an earlier version stores an unusable `publicKeyBase58`. Such a DID cannot be re-registered - `createDID` reverts with `DID already exist` - but the document can be replaced in place with `updateDIDDoc`, which overwrites the stored doc and is callable only by the DID's controller. Run an update with a corrected document; without the DID's private key the identity must be replaced. A stored value that decodes to 68 bytes is affected; 33 bytes is correct. See the did-registrar README for details.

### Minor Changes

- 2eb0b65: Reject malformed input instead of silently accepting it, and cover the guards with tests.

  `parseDid` and `getNetworkFromDid` treated any string that was not a recognised DID as mainnet, returning the mainnet contract address with `didAddress: undefined`. A malformed DID therefore resolved against the wrong registry rather than being rejected. Both now throw `invalid did provided`, and `parseDid` validates before parsing. `validateDid` also rejects non-string input.

  `PolygonDID.updateResource` only checked the DID when a `resourceId` was present (`!isValidDid && resourceId`), so an invalid DID with an empty `resourceId` skipped validation entirely; the two are now checked independently. `PolygonDID.update` read `Object.keys` on its argument without a null check and had an unreachable `!didDoc && !JSON.parse(didDoc)` branch that passed an object to `JSON.parse`; the argument is now validated before use.

  The demo API's `/broadcast` relay refuses a signed transaction that carries value, and `parseDidDocument` rejects malformed JSON and non-object documents with a clear message instead of an uncaught `JSON.parse` error.

  These are `minor` rather than `major`: the changes reject input that was already invalid, and every documented call path validates before calling.

### Patch Changes

- Updated dependencies [2eb0b65]
  - @ayanworks/polygon-did-resolver@1.1.0

## 2.2.2

### Patch Changes

- Updated dependencies [ea8d5e9]
  - @ayanworks/polygon-did-resolver@1.0.4

## 2.2.1

### Patch Changes

- 61def69: - fix keyId mapping fixed for created did
  - fix publish imports
  - use compressed base58url for verification
- 5b1b1d7: fix exports and Make parsing did configurable by adding ability to pass the rpcUrl and contractAddress.
- Updated dependencies [61def69]
- Updated dependencies [5b1b1d7]
  - @ayanworks/polygon-did-registry-contract@4.0.1
  - @ayanworks/polygon-did-resolver@1.0.3

## 2.2.0

### Minor Changes

- 24e4aed: remove the signer and keep signing key as before

## 2.1.0

### Minor Changes

- 029cb6b: Added signer option and removed the signing key option

## 2.0.0

### Major Changes

- 99a40f8: update to esm
