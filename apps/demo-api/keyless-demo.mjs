/** biome-ignore-all lint/suspicious/noConsole: interactive walkthrough script - its output is the point */

/**
 * Local-signing (keyless) walkthrough for the Polygon DID demo API.
 *
 * Generates a key pair locally, registers the DID on the chain through the
 * keyless flow (POST /tx-intent -> sign locally -> POST /broadcast) and
 * resolves it back. The private key never leaves this process.
 *
 * Run against a locally started demo API (pnpm --filter @ayanworks/polygon-did-demo-api dev):
 *   node apps/demo-api/keyless-demo.mjs
 *
 * The address must hold a little Amoy MATIC for the broadcast step:
 *   https://faucet.polygon.technology/  (network: Amoy, token: POL)
 */
import { encodeBase58, getBytes, SigningKey, Wallet } from 'ethers'

const API = process.env.API_URL ?? 'http://localhost:8081'

// Step 0 - generate the key locally. It never leaves this process.
const wallet = Wallet.createRandom()
const did = `did:polygon:testnet:${wallet.address}`
console.log(`did:  ${did}\nkey:  ${wallet.privateKey}   (keep it local!)`)

// Step 1 - build the DID document locally from the PUBLIC key only.
// Same shape that POST /create-did produces; the base58 derivation matches
// the library, so documents from both paths are interchangeable. The payload
// is the 33 key bytes, not the hex text of the key.
const publicKeyBase58 = encodeBase58(getBytes(SigningKey.computePublicKey(wallet.privateKey, true)))
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

const call = (path, body) =>
  fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (response) => {
    const result = await response.json()
    if (!result.success) {
      throw new Error(`${path} -> ${result.message}`)
    }
    return result.data
  })

// Step 2 - ask the API for the unsigned transaction. No key in the request.
const intent = await call('/tx-intent', { operation: 'create', did, didDoc })
console.log(`\nintent: to=${intent.to} nonce=${intent.nonce} chainId=${intent.chainId} gasLimit=${intent.gasLimit}`)

// Step 3 - sign locally. Sign ONLY the transaction fields: `from` and
// `operation` are informational and ethers rejects unknown keys.
const { to, data, value, nonce, chainId, gasLimit, maxFeePerGas, maxPriorityFeePerGas } = intent
const signedTx = await wallet.signTransaction({
  to,
  data,
  value,
  nonce,
  chainId,
  gasLimit,
  maxFeePerGas,
  maxPriorityFeePerGas,
})

// Step 4 - relay the signed raw transaction. The server only validates and forwards it.
try {
  const { txnHash } = await call('/broadcast', { signedTx })
  console.log(`\nregistered ${did} in tx ${txnHash}`)

  // Step 5 - verify against the chain.
  const resolution = await fetch(`${API}/resolve-did/${did}`).then((response) => response.json())
  console.log(`resolved back from chain: ${resolution.id === did}`)
} catch (error) {
  if (String(error.message).includes('insufficient funds')) {
    console.log(
      `\nsigned a valid transaction, but ${wallet.address} holds no Amoy MATIC yet.\n` +
        `Fund it at https://faucet.polygon.technology/ (network: Amoy, token: POL) and run again.`
    )
  } else {
    throw error
  }
}
