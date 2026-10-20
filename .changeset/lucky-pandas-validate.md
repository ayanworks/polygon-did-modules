---
"@ayanworks/polygon-did-resolver": minor
"@ayanworks/polygon-did-registrar": minor
---

Reject malformed input instead of silently accepting it, and cover the guards with tests.

`parseDid` and `getNetworkFromDid` treated any string that was not a recognised DID as mainnet, returning the mainnet contract address with `didAddress: undefined`. A malformed DID therefore resolved against the wrong registry rather than being rejected. Both now throw `invalid did provided`, and `parseDid` validates before parsing. `validateDid` also rejects non-string input.

`PolygonDID.updateResource` only checked the DID when a `resourceId` was present (`!isValidDid && resourceId`), so an invalid DID with an empty `resourceId` skipped validation entirely; the two are now checked independently. `PolygonDID.update` read `Object.keys` on its argument without a null check and had an unreachable `!didDoc && !JSON.parse(didDoc)` branch that passed an object to `JSON.parse`; the argument is now validated before use.

The demo API's `/broadcast` relay refuses a signed transaction that carries value, and `parseDidDocument` rejects malformed JSON and non-object documents with a clear message instead of an uncaught `JSON.parse` error.

These are `minor` rather than `major`: the changes reject input that was already invalid, and every documented call path validates before calling.
