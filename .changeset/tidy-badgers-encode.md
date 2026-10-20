---
"@ayanworks/polygon-did-registrar": major
---

`PolygonDID.createKeyPair` now Base58-encodes the 33 compressed public-key **bytes**, matching the on-chain DID documents and `@ayanworks/polygon-did-credo-module`.

Previously it encoded the hex **text** of the key, so `publicKeyBase58` decoded to the 68-byte ASCII string `"0x03ab..."` instead of the key itself. The value was longer than a valid key (~93 characters instead of ~44) and no verifier could use a document built from it.

This also removes the package's only Node dependency (`Buffer`), so it now bundles and runs unchanged in browsers.

**Migration.** Any DID registered with an earlier version stores an unusable `publicKeyBase58`. Such a DID cannot be re-registered - `createDID` reverts with `DID already exist` - but the document can be replaced in place with `updateDIDDoc`, which overwrites the stored doc and is callable only by the DID's controller. Run an update with a corrected document; without the DID's private key the identity must be replaced. A stored value that decodes to 68 bytes is affected; 33 bytes is correct. See the did-registrar README for details.
