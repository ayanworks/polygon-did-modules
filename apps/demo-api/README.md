# Polygon DID Demo API

Demo REST API exposing the Polygon DID modules (`create`, `register`, `resolve`, `update`) as HTTP endpoints.
This app lives inside the `polygon-did-modules` workspace and consumes the libraries through `workspace:*`,
so it always runs against the local sources of the packages in this repository.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/create-did` | Generate a key pair, DID and DID document locally (no chain transaction) |
| `POST` | `/register-did` | Register a DID document on the Polygon chain *(custodial - receives the private key)* |
| `GET` | `/resolve-did/:did` | Resolve a DID to its DID document |
| `PATCH` | `/update-did/:did` | Update the DID document stored on the chain *(custodial - private key in the request body)* |
| `POST` | `/tx-intent` | **Keyless:** build the unsigned create/update transaction |
| `POST` | `/broadcast` | **Keyless:** relay a transaction that was signed locally |

Interactive documentation: `http://localhost:8081/index`

> The former `DELETE /delete-did/:did/:privateKey` endpoint has been removed: neither the registrar 2.x
> API nor the `PolygonDidRegistry` smart contract supports deleting a DID.

## Local signing (keyless flow, recommended)

The custodial endpoints mirror the registrar library and are fine for local demos, but a private key
should never travel over HTTP in a real deployment. The keyless flow keeps the key on your side: the
API only builds the unsigned transaction and later relays what **you** signed.

| Flow | Endpoints | Where the key lives | Use it when |
|------|-----------|---------------------|-------------|
| Custodial | `/register-did`, `/update-did` | Sent to the API in the request | Local experiments only |
| **Keyless** | `/tx-intent` → *(you sign)* → `/broadcast` | **Never leaves your machine** | Anything beyond a laptop demo |

### Quick sketch

```bash
# 1. Ask the API for the unsigned transaction (no key involved)
curl -s -X POST http://localhost:8081/tx-intent -H 'content-type: application/json' \
  -d '{"operation":"create","did":"did:polygon:testnet:0xYOUR_ADDR","didDoc":{ ... }}'
# → data: { from, to, data, value, nonce, chainId, gasLimit, maxFeePerGas, maxPriorityFeePerGas }

# 2. Sign it locally (browser, wallet or CLI - the key never leaves your machine)
#    wallet.signTransaction({ to, data, value, nonce, chainId, gasLimit, maxFeePerGas, maxPriorityFeePerGas })

# 3. Relay the signed raw transaction
curl -s -X POST http://localhost:8081/broadcast -H 'content-type: application/json' \
  -d '{"signedTx":"0x02f8..."}'
# → { success: true, data: { txnHash: "0x..." } }
```

`operation` is `create` (register a new document) or `update` (replace the stored one).

### Complete walkthrough (Node.js 22+)

The script below does the full lifecycle with zero key exposure: generate a key locally, register the
DID on Amoy through the keyless flow, then resolve it back from the chain. It ships with the repo as
[`keyless-demo.mjs`](./keyless-demo.mjs) - run it against the locally started API:

```bash
node apps/demo-api/keyless-demo.mjs
```

```js
import { SigningKey, Wallet, encodeBase58, toUtf8Bytes } from 'ethers'

const API = 'http://localhost:8081'

// Step 0 - generate the key locally. It never leaves this process.
const wallet = Wallet.createRandom()
const did = `did:polygon:testnet:${wallet.address}`

// Step 1 - build the DID document locally from the PUBLIC key only.
// (Same shape that POST /create-did produces; the demo API derives the base58
//  key the same way, so documents from both paths are interchangeable.)
const publicKeyBase58 = encodeBase58(toUtf8Bytes(SigningKey.computePublicKey(wallet.privateKey, true)))
const didDoc = {
  '@context': ['https://w3id.org/did/v1', 'https://w3id.org/security/suites/secp256k1-2019/v1'],
  id: did,
  verificationMethod: [
    { id: `${did}#key-1`, type: 'EcdsaSecp256k1VerificationKey2019', controller: did, publicKeyBase58 },
  ],
  authentication: [`${did}#key-1`],
  assertionMethod: [`${did}#key-1`],
  capabilityDelegation: [`${did}#key-1`],
  capabilityInvocation: [`${did}#key-1`],
  keyAgreement: [`${did}#key-1`],
}

// Step 2 - ask the API for the unsigned transaction. No key in the request.
const intent = await fetch(`${API}/tx-intent`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ operation: 'create', did, didDoc }),
}).then((response) => response.json())

if (!intent.success) throw new Error(intent.message)

// Step 3 - sign locally. Sign ONLY the transaction fields: `from` and
// `operation` are informational and ethers rejects unknown keys.
const { to, data, value, nonce, chainId, gasLimit, maxFeePerGas, maxPriorityFeePerGas } = intent.data
const signedTx = await wallet.signTransaction({
  to, data, value, nonce, chainId, gasLimit, maxFeePerGas, maxPriorityFeePerGas,
})

// Step 4 - relay the signed raw transaction. The server only validates and forwards it.
const broadcast = await fetch(`${API}/broadcast`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ signedTx }),
}).then((response) => response.json())

if (!broadcast.success) throw new Error(broadcast.message)
console.log('registered', did, 'in tx', broadcast.data.txnHash)

// Step 5 - verify against the chain.
const resolution = await fetch(`${API}/resolve-did/${did}`).then((response) => response.json())
console.log('on chain:', resolution.id === did)
```

**Funding:** the address in step 0 must hold a little Amoy MATIC before step 4, otherwise the node
rejects the transaction and `/broadcast` answers
`{"success":false,"message":"insufficient funds for intrinsic transaction cost"}`. Get test MATIC
from the [Polygon Amoy faucet](https://faucet.polygon.technology/) (network *Amoy*, token *POL*).
To try register-then-update, run step 2-4 again with `operation: 'update'` and a modified `didDoc` -
`/tx-intent` refuses `create` for an existing DID and `update` for an unknown one, mirroring the
custodial endpoints.

### Things to know

- **Sign only the transaction fields.** The intent response also carries `from` (the DID address, for
  your sanity check against the wallet) and `operation` (which endpoint built it). Both are
  informational - do not pass them to `signTransaction`.
- **An intent is a snapshot.** `nonce`, gas and fees are fetched at request time. If the chain moves
  between signing and broadcasting, the node rejects the transaction (`nonce too low`,
  `replacement transaction underpriced`) - simply request a fresh intent and sign again.
- **The relay is deliberately narrow.** `/broadcast` accepts only transactions that are signed, target
  the configured registry contract and carry a `createDID`/`updateDIDDoc` selector, so it cannot be
  used to relay arbitrary transactions.
- **Browser usage is identical.** The three calls (`tx-intent`, `signTransaction`, `broadcast`) work
  the same from a web app or a wallet extension - the key material stays in the browser or the
  wallet, never in the API.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8081` | HTTP port |
| `POLYGON_RPC_URL` | `https://polygon-amoy-bor-rpc.publicnode.com` | Polygon (Amoy testnet) JSON-RPC endpoint |
| `POLYGON_CONTRACT_ADDRESS` | `0xcB80F37eDD2bE3570c6C9D5B0888614E04E1e49E` | DID registry contract address |

See `.env.example`.

## Run

```bash
pnpm --filter @ayanworks/polygon-did-demo-api dev
```

## Test

```bash
pnpm --filter @ayanworks/polygon-did-demo-api test
```

The route tests mock `@ayanworks/polygon-did-registrar` and `@ayanworks/polygon-did-resolver`, so no test
ever reaches a real RPC endpoint. They pin the HTTP contract: routes, status codes, payload shapes and
error handling.
