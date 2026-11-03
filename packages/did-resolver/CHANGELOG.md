# @ayanworks/polygon-did-resolver

## 1.1.0

### Minor Changes

- 2eb0b65: Reject malformed input instead of silently accepting it, and cover the guards with tests.

  `parseDid` and `getNetworkFromDid` treated any string that was not a recognised DID as mainnet, returning the mainnet contract address with `didAddress: undefined`. A malformed DID therefore resolved against the wrong registry rather than being rejected. Both now throw `invalid did provided`, and `parseDid` validates before parsing. `validateDid` also rejects non-string input.

  `PolygonDID.updateResource` only checked the DID when a `resourceId` was present (`!isValidDid && resourceId`), so an invalid DID with an empty `resourceId` skipped validation entirely; the two are now checked independently. `PolygonDID.update` read `Object.keys` on its argument without a null check and had an unreachable `!didDoc && !JSON.parse(didDoc)` branch that passed an object to `JSON.parse`; the argument is now validated before use.

  The demo API's `/broadcast` relay refuses a signed transaction that carries value, and `parseDidDocument` rejects malformed JSON and non-object documents with a clear message instead of an uncaught `JSON.parse` error.

  These are `minor` rather than `major`: the changes reject input that was already invalid, and every documented call path validates before calling.

## 1.0.4

### Patch Changes

- ea8d5e9: Replace the dead Polygon Amoy testnet RPC default (`rpc-amoy.polygon.technology` no longer resolves in DNS) with the public endpoint `https://polygon-amoy-bor-rpc.publicnode.com`. Test fixtures across the workspace were updated to the same endpoint.

## 1.0.3

### Patch Changes

- 61def69: - fix keyId mapping fixed for created did
  - fix publish imports
  - use compressed base58url for verification
- 5b1b1d7: fix exports and Make parsing did configurable by adding ability to pass the rpcUrl and contractAddress.
- Updated dependencies [61def69]
- Updated dependencies [5b1b1d7]
  - @ayanworks/polygon-did-registry-contract@4.0.1

## 1.0.2

### Patch Changes

- dd214b1: bump polygon-did-registry-contract to 4.0.0

## 1.0.1

### Patch Changes

- 9405119: add exports from did-resolver and convert the package to esm
