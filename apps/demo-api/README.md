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

## Web playground

The API also serves a browser playground at **`http://localhost:8081/`** - no build step, no login. It is
plain HTML/JS served straight from [`public/`](./public) by the same Express app, so starting the server is
all it takes. It exists so anyone can exercise every endpoint without writing a request by hand.

What it gives you:

- **Generate an identity in the browser.** The key pair and DID document are produced locally with
  [`ethers`](https://docs.ethers.io) (loaded from a CDN), and the derivation is byte-for-byte identical to
  `POST /create-did` - so a DID you make in the page is a real `did:polygon` DID.
- **Run the keyless flow.** The page asks `/tx-intent` for the unsigned transaction, signs it locally
  (in-browser key **or** an EIP-1193 wallet such as MetaMask), then relays it through `/broadcast`. The
  step list shows exactly where the key was used. The server never sees it.
- **Resolve any DID**, including the on-chain sample that is already registered.
- **Exercise the custodial routes** too, behind a confirmation dialog that spells out that the key will
  be sent to the API.
- **A request log** with the exact payload, the response, and a copyable `curl` for every call, plus a
  card per endpoint where you can edit the body and send it.

The page wears AYANWORKS branding - the navy surfaces and sovereign-gold accent are taken from
[ayanworks.com](https://www.ayanworks.com), and the lockup in `public/assets/` is served from this app
rather than hot-linked. Only the two web fonts (Inter, JetBrains Mono) are fetched from a CDN.

Notes:

- Nothing is persisted. Keys live only in the page and disappear on reload; the "sample" identity ships
  no key, so it can be resolved but not written to.
- The page loads `ethers` from a CDN, so it needs network access. The API itself does not.
- Branding assets (the logo and favicon) are bundled locally, so the page still looks right offline;
  only the `ethers` import and the two web fonts need the network.
- `GET /config` reports the RPC URL and registry address the instance is wired to (public information),
  which the page uses to tell you what you are actually talking to.

### Hosting the playground on its own

The playground is static files, so it can be hosted separately from the API - Deno Deploy, for example.
That is useful when you want a public UI without exposing the API host, and it works because the API
already sends permissive CORS headers.

Only the UI is portable. The API itself is **not** a Deno Deploy target: it needs a real filesystem
(`log4js` log files, Swagger UI's on-disk assets, `public/`), Node's `http` internals via Express, and
three `workspace:*` packages that resolve by path. Keep the API on a Node host.

[`deploy/server.ts`](./deploy/server.ts) is a small Deno server that serves `public/` and fills in the
API origin:

```sh
cd apps/demo-api
API_BASE=https://your-api-host deno deploy --project polygon-did-playground
```

`API_BASE` is written into the page's `<meta name="api-base">` tag, which `app.js` reads at startup. The
same files therefore stay correct in both places: served locally by the API the tag is empty and requests
are same-origin; served from the static host they go to `API_BASE`. If `API_BASE` is not set the server
logs a warning, because the deploy would otherwise look healthy and 404 on every request.

Two things to check on the API side when you split them:

- CORS is on by default (`app.use(cors())`). To restrict it, set the allowed origin explicitly rather
  than leaving it open.
- Serve the API over HTTPS. A page on an `https://` origin cannot call an `http://` API.

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

One command starts everything - the REST API, Swagger UI and the playground are all served by the same
Express app, so there is no second process and no second port.

```bash
pnpm --filter @ayanworks/polygon-did-demo-api dev
```

Then open:

| Surface | URL | What it is |
|---------|-----|------------|
| Playground UI | <http://localhost:8081/> | The clickable page: generate an identity, run the keyless flow, try every endpoint |
| Swagger UI | <http://localhost:8081/index> | The API contract, generated from `swagger.json` |
| REST API | <http://localhost:8081/> | Call it directly, e.g. `curl http://localhost:8081/config` |
| Config | <http://localhost:8081/config> | The RPC URL and registry address this instance is wired to |

Port `8081` is the default; set `PORT` to change it. Unknown paths return JSON `404`, not the HTML page -
only `/` serves the playground.

Quick check that it is up:

```bash
curl -s http://localhost:8081/config
# {"success":true,"data":{"rpcUrl":"...","contractAddress":"0x..."}}
```

For a scripted walkthrough of the keyless flow (no browser, signs with a throwaway key):

```bash
node apps/demo-api/keyless-demo.mjs
```

## Test

```bash
pnpm --filter @ayanworks/polygon-did-demo-api test
```

The route tests mock `@ayanworks/polygon-did-registrar` and `@ayanworks/polygon-did-resolver`, so no test
ever reaches a real RPC endpoint. They pin the HTTP contract: routes, status codes, payload shapes and
error handling.
