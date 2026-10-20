# Polygon DID Method

The polygon DID method library uses Ethereum based addresses as fully functional DID’s or Decentralized identifiers, on the Polygon network. The following allows one to create a key Pair based and facilitates its storage on the registry smart contract, deployed on Polygon chain.
Third party users can use this to create polygon DID identities. It allows the controller to perform actions like resolve, update and delete by encapsulating polygonDID registry and PolygonDID resolver.
The DID identifier allows the controller to resolve DID document for usage in different scenarios.

### Example of polygon DID document resolved using PolygonDIDResolver:

```json
{
  "@context": "https://w3id.org/did/v1",
  "id": "did:polygon:0x794b781493AeD65b9ceBD680716fec257e118993",
  "verificationMethod": [
    {
      "id": "did:polygon:0x794b781493AeD65b9ceBD680716fec257e118993",
      "type": "EcdsaSecp256k1VerificationKey2019",
      "controller": ["did:polygon:0x794b781493AeD65b9ceBD680716fec257e118993"],
      "publicKeyBase58": "29rkwHiVCjyhXk9FWhepUrHpEyurUSCFHh4aoDqb1adj8"
    }
  ]
}
```

# DID Method or DID schema

The DID method is a specific implementation of a DID scheme that will be identified by method name. For this case the method name is “polygon”, and the identifier is an Ethereum address.

## The DID for Polygon looks like:

### On Polygon mainnet

```
did:polygon:0xdce5306fb5f9ba6797546dcd2e11eb5c5201bfeb
```

### On Polygon testnet

```
did:polygon:testnet:0xdce5306fb5f9ba6797546dcd2e11eb5c5201bfeb
```

## DID On-Chain

Every DID on chain has the same structure, defined as:

Where,

- controller : the address of the person who creates and manages the DID
- created : holds the timestamp of the block when DID was created
- updated : initially holds the timestamp of when the DID was created, but is updated if the controller updates the DID on chain, and
- doc : holds the entire DID document in form of string.

# DID Operations

## Create

Creating a createKeyPair refers to generation of a DID uri, based on a newly generated wallet.

```js
import { createKeyPair } from 'polygon-did-registrar'
const keys = await createKeyPair(network)
```

The function returns address, privateKey, publicKeyBase58, did

### `publicKeyBase58` encoding

`publicKeyBase58` is the Base58 encoding of the **33 compressed public-key bytes**. It is the same
derivation used by the registry documents on chain and by `@ayanworks/polygon-did-credo-module`, so a
document built from this value is verifiable by any other implementation.

> **Changed in 3.0.0.** Earlier versions Base58-encoded the hex *text* of the public key instead of its
> bytes. The output was longer than a valid key (~93 characters rather than ~44) and decoded to the
> 68-byte ASCII string `"0x03ab..."` rather than the key, so no verifier could use it. See
> [Repairing an affected DID](#repairing-an-affected-did) if you persisted an older value.

## Browser

The package is pure TypeScript on top of `ethers` and uses no Node built-ins, so it bundles for the
browser with no polyfills and no `Buffer` shim:

```sh
npx esbuild your-entry.ts --bundle --format=esm --platform=browser \
  --main-fields=browser,module,main --conditions=browser,import,default \
  --outfile=public/bundle.js
```

```js
import { PolygonDID } from '@ayanworks/polygon-did-registrar'
import { getResolver } from '@ayanworks/polygon-did-resolver'
import { Resolver } from 'did-resolver'

const { privateKey, publicKeyBase58, did } = PolygonDID.createKeyPair('testnet')

// Reads go straight to the RPC from the page.
const document = await new Resolver(getResolver()).resolve(did)

// Writes sign in the page and broadcast the raw transaction, so the key never
// leaves the browser.
const signed = await new Wallet(privateKey).signTransaction(txFromTheRpc)
await provider.broadcastTransaction(signed)
```

Notes:

- **No private key needs to leave the browser.** The registry accepts a signed raw transaction, so a
  page can sign locally and post the result.
- Public RPC endpoints must send `access-control-allow-origin` for browser reads to work. The default
  Amoy endpoint does; a private endpoint may need CORS enabled.
- The bundle is ~900 KB raw / ~160 KB gzipped, essentially all `ethers`.

## Repairing an affected DID

A DID registered before 3.0.0 holds an unusable `publicKeyBase58`. It **cannot be re-registered** -
`createDID` reverts with `DID already exist` - but it **can be repaired in place**, because
`updateDIDDoc` overwrites the stored document:

```js
const corrected = { ...document, verificationMethod: [{ ...vm, publicKeyBase58: correctBase58 }] }
await polygonDID.update(did, corrected)
```

`updateDIDDoc` is guarded by `onlyController`, so this requires the DID's private key. Without it the
document cannot be corrected and the identity must be replaced. To detect affected documents, decode the
stored value: 33 bytes is correct, 68 bytes is the old encoding.

## Register

Register of DID is done by logging the transaction on the polygon-register smart contract, by invoking

```js
import { create } from 'polygon-did-registrar'
const txHash = await create(did, didDoc)
```

The function returns a txnHash and DID and didDoc on successful execution.

## Update

The DID controller requests for the update functionality, if the controller wishes to edit the did doc store on the ledger using :

```js
import { update } from 'polygon-did-registrar'
const txHash = await update(did, didDoc)
```

## Add Resource

Add DID-linked resource for the DID-Doc.

```js
import { addResource } from 'polygon-did-registrar'
const txHash = await addResource(did, resourcePayload)
```

The function returns a txhash, DID, and resourceId on successful execution.

## Update Resource

Update DID-linked resource for the DID-Doc.

```js
import { updateResource } from 'polygon-did-registrar'
const txHash = await updateResource(did, resourceId, resourcePayload)
```

The function returns a txhash, DID, and resourceId on successful execution.

## Fetch Resource

Get a DID-linked resource for a specific DID.

```js
import { getResourceByDidAndResourceId } from 'polygon-did-registrar'
const txHash = await getResourceByDidAndResourceId(did, resourceId)
```

The function returns DID-linked resource and DID uri on successful execution.

## Fetch all Resources

Get all DID-linked resources for a specific DID.

```js
import { getResourcesByDid } from 'polygon-did-registrar'
const txHash = await getResourcesByDid(did)
```

The function returns the list of DID-linked resources and DID on successful execution.