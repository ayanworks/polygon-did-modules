/**
 * Polygon DID Playground.
 *
 * A dependency-free front end for the demo API. Scripts are loaded from a CDN
 * for the crypto that the browser cannot do natively (secp256k1 signing and
 * RLP encoding); everything else is plain DOM code below.
 *
 * Signing paths offered to the visitor:
 *   1. in-browser key  - a throwaway key generated in this tab, used for the
 *                        keyless flow. Nothing is persisted.
 *   2. wallet          - window.ethereum (MetaMask), also keyless.
 *   3. server key      - the custodial routes, which do send the key to the API.
 */
import {
  computeAddress,
  encodeBase58,
  SigningKey,
  toUtf8Bytes,
  Wallet,
} from 'https://cdn.jsdelivr.net/npm/ethers@6.13.4/+esm'

// The DID that is already registered on Amoy. Used by "Load the on-chain
// sample" so a visitor can prove resolution works without spending anything.
const SAMPLE_DID = 'did:polygon:testnet:0x138d2231e4362fc0e028576Fb2DF56904bd59C1b'

const $ = (id) => document.getElementById(id)

const state = {
  did: '',
  privateKey: '',
  didDoc: null,
  walletAddress: null,
}

/* ------------------------------------------------------------------ utils */

const truncate = (value, size = 22) =>
  typeof value === 'string' && value.length > size * 2 ? `${value.slice(0, size)}…${value.slice(-8)}` : value

const json = (value) => JSON.stringify(value, null, 2)

const setResult = (element, payload, isError = false) => {
  element.classList.toggle('err', isError)
  element.textContent = typeof payload === 'string' ? payload : json(payload)
}

const parseDoc = () => {
  try {
    return JSON.parse($('didDoc').value)
  } catch (error) {
    throw new Error(`The DID document is not valid JSON: ${error.message}`)
  }
}

/* ------------------------------------------------------- request logging */

const buildCurl = ({ method, path, body }) => {
  // Must point at the API, not the page: when the UI is hosted separately the
  // page's own origin would send someone to the wrong host.
  const parts = [`curl -s -X ${method} '${API_BASE || location.origin}${path}'`]
  if (body !== undefined) {
    parts.push(`-H 'content-type: application/json' -d '${JSON.stringify(body)}'`)
  }
  return parts.join(' \\\n  ')
}

const appendLog = ({ method, path, body, status, response, error }) => {
  const entry = document.createElement('details')
  entry.className = 'log-entry'
  entry.open = Boolean(error)

  const summary = document.createElement('summary')
  const badge = document.createElement('span')
  badge.className = `status ${error ? 'err' : 'ok'}`
  badge.textContent = error ? 'ERR' : String(status)
  const label = document.createElement('span')
  label.textContent = `${method} ${path}`
  const timing = document.createElement('span')
  timing.style.marginLeft = 'auto'
  timing.style.color = 'var(--muted)'
  timing.textContent = new Date().toLocaleTimeString()
  summary.append(badge, label, timing)
  entry.append(summary)

  const bodyPane = document.createElement('div')
  bodyPane.className = 'body'

  if (body !== undefined) {
    bodyPane.append(labelFor('request body'))
    bodyPane.append(resultPane(body))
  }
  bodyPane.append(labelFor(error ? 'error' : 'response'))
  bodyPane.append(resultPane(error ? { success: false, message: error.message } : response))

  const curlLabel = labelFor('curl')
  const curl = document.createElement('pre')
  curl.className = 'result'
  curl.textContent = buildCurl({ method, path, body })
  bodyPane.append(curlLabel, curl)

  entry.append(bodyPane)
  $('log').prepend(entry)
}

const labelFor = (text) => {
  const span = document.createElement('div')
  span.className = 'log-label'
  span.textContent = text
  return span
}

const resultPane = (value) => {
  const pre = document.createElement('pre')
  pre.className = 'result'
  pre.textContent = typeof value === 'string' ? value : json(value)
  return pre
}

/* ---------------------------------------------------------- http helper */

/**
 * Where the API lives. Same-origin by default, so running the server locally
 * needs no configuration. When the page is hosted separately (for example the
 * static UI on Deno Deploy talking to an API elsewhere) set `window.API_BASE`
 * to the API's origin via a small inline script or a `<meta>` tag before this
 * module loads.
 */
const API_BASE = (() => {
  const configured = window.API_BASE ?? document.querySelector('meta[name="api-base"]')?.content
  if (!configured) return ''
  // Trailing slashes would produce '//create-did' once concatenated.
  return String(configured).replace(/\/+$/, '')
})()

const apiUrl = (path) => `${API_BASE}${path}`

const api = async (method, path, body) => {
  const options = { method, headers: {} }
  if (body !== undefined) {
    options.headers['content-type'] = 'application/json'
    options.body = JSON.stringify(body)
  }

  let response
  try {
    response = await fetch(apiUrl(path), options)
  } catch (error) {
    appendLog({ method, path, body, error })
    throw error
  }

  const text = await response.text()
  let payload
  try {
    payload = text === '' ? null : JSON.parse(text)
  } catch {
    payload = text
  }

  appendLog({ method, path, body, status: response.status, response: payload })

  if (!response.ok) {
    const message = payload?.message ? payload.message : `HTTP ${response.status}`
    throw new Error(message)
  }
  return payload
}

/* ------------------------------------------------------------- identity */

const renderIdentityMeta = () => {
  const meta = $('identity-meta')
  meta.textContent = ''
  if (!state.did) return

  const address = state.did.split(':').pop()
  const rows = [
    ['address', address],
    ['network', state.did.includes(':testnet:') ? 'testnet (Amoy)' : 'mainnet'],
  ]

  if (!state.privateKey) {
    rows.push(['key', 'none loaded - the keyless flow needs one; write calls will fail without it'])
  } else if (state.walletAddress && state.walletAddress.toLowerCase() === address.toLowerCase()) {
    rows.push(['identity', 'key matches the DID - this identity can register and update it'])
  } else {
    rows.push(['warning', 'the loaded key does not match the DID address'])
  }

  for (const [key, value] of rows) {
    const line = document.createElement('div')
    const strong = document.createElement('b')
    strong.textContent = `${key}: `
    line.append(strong, document.createTextNode(value))
    meta.append(line)
  }
}

const applyIdentity = ({ did, privateKey, didDoc }) => {
  state.did = did ?? state.did
  state.privateKey = privateKey ?? state.privateKey
  if (didDoc) {
    state.didDoc = didDoc
    $('didDoc').value = json(didDoc)
  }
  $('did').value = state.did
  $('privateKey').value = state.privateKey
  renderIdentityMeta()
}

const buildDocumentLocally = (did, privateKey) => {
  const key = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
  const publicKeyBase58 = encodeBase58(toUtf8Bytes(SigningKey.computePublicKey(key, true)))
  const verificationMethod = {
    id: `${did}#key-1`,
    type: 'EcdsaSecp256k1VerificationKey2019',
    controller: did,
    publicKeyBase58,
  }
  return {
    '@context': ['https://w3id.org/did/v1', 'https://w3id.org/security/suites/secp256k1-2019/v1'],
    id: did,
    verificationMethod: [verificationMethod],
    authentication: [verificationMethod.id],
    assertionMethod: [verificationMethod.id],
    capabilityDelegation: [verificationMethod.id],
    capabilityInvocation: [verificationMethod.id],
    keyAgreement: [verificationMethod.id],
  }
}

/**
 * Generates the key pair in the browser rather than calling POST /create-did,
 * so the playground's own flow never hands a fresh key to the server. The
 * document is byte-for-byte the shape that endpoint produces.
 */
const generateIdentity = () => {
  const wallet = Wallet.createRandom()
  const did = `did:polygon:testnet:${wallet.address}`
  state.walletAddress = wallet.address
  applyIdentity({ did, privateKey: wallet.privateKey, didDoc: buildDocumentLocally(did, wallet.privateKey) })
}

/**
 * Loads the DID that is already registered on Amoy. It fetches the real on-chain
 * document rather than fabricating one, and deliberately does not touch the key
 * field: this DID's controller key is not published, so no local key can update
 * it. That is the point of the sample - resolve works, write access does not.
 */
const loadSample = async () => {
  const did = SAMPLE_DID
  state.did = did
  state.walletAddress = null
  state.privateKey = ''
  $('did').value = did
  $('privateKey').value = ''
  renderIdentityMeta()

  try {
    const document = await api('GET', `/resolve-did/${encodeURI(did)}`)
    if (document?.id) {
      state.didDoc = document
      $('didDoc').value = json(document)
    }
    syncOperationToChainState(document)
  } catch (error) {
    const line = document.createElement('div')
    const strong = document.createElement('b')
    strong.textContent = 'error: '
    line.append(strong, document.createTextNode(`could not resolve the sample DID - ${error.message}`))
    $('identity-meta').append(line)
  }
}

/* --------------------------------------------------------- keyless flow */

const setStep = (id, text, stepState) => {
  const element = $(id)
  element.textContent = text
  element.dataset.state = stepState
}

const resetSteps = (ids) => {
  for (const id of ids) {
    setStep(id, $(id).dataset.label, 'idle')
  }
}

const localSigner = async (intent) => {
  if (!state.privateKey) {
    throw new Error('no private key is loaded - use "Generate a new identity", or pick the wallet signer')
  }
  const wallet = new Wallet(state.privateKey)
  return wallet.signTransaction(transactionFields(intent))
}

const walletSigner = async (intent) => {
  if (!window.ethereum) {
    throw new Error('No wallet detected. Install MetaMask or use the in-browser signer.')
  }
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
  const fields = transactionFields(intent)
  return window.ethereum.request({
    method: 'eth_signTransaction',
    params: [{ ...fields, from: accounts[0] }],
  })
}

/**
 * Only the transaction fields are signed - `operation` and `from` in the
 * intent response are informational and must not be passed to the signer.
 */
const transactionFields = (intent) => ({
  to: intent.to,
  data: intent.data,
  value: intent.value,
  nonce: intent.nonce,
  chainId: intent.chainId,
  gasLimit: intent.gasLimit,
  maxFeePerGas: intent.maxFeePerGas,
  maxPriorityFeePerGas: intent.maxPriorityFeePerGas,
})

/**
 * Points the operation selector at the one that can actually succeed: a DID that
 * already resolves needs an update, an unknown one needs a create. Called after
 * any resolve so a first-time visitor does not hit "already registered".
 */
const syncOperationToChainState = (document) => {
  const select = $('intent-operation')
  if (!select || !state.did) return
  select.value = document?.id === state.did ? 'update' : 'create'
}

const runKeyless = async (signerName) => {
  const steps = ['step-intent', 'step-sign', 'step-broadcast', 'step-verify']
  resetSteps(steps)
  hideFundingHelp()

  try {
    if (!state.did) throw new Error('Generate or load an identity first')
    const didDoc = parseDoc()
    const operation = $('intent-operation').value

    setStep('step-intent', 'POST /tx-intent - asking the API for the unsigned transaction...', 'run')
    const response = await api('POST', '/tx-intent', { operation, did: state.did, didDoc })
    const intent = response.data
    setStep(
      'step-intent',
      `POST /tx-intent - got calldata for ${operation} (nonce ${BigInt(intent.nonce)}, gas ${BigInt(intent.gasLimit)})`,
      'ok'
    )

    setStep('step-sign', `Signing locally with the ${signerName}...`, 'run')
    const signer = signerName === 'wallet' ? walletSigner : localSigner
    const signedTx = await signer(intent)
    setStep('step-sign', `Signed locally - ${truncate(signedTx, 26)} (the key stayed in the browser)`, 'ok')

    setStep('step-broadcast', 'POST /broadcast - relaying the signed transaction...', 'run')
    const broadcast = await api('POST', '/broadcast', { signedTx })
    setStep('step-broadcast', `POST /broadcast - accepted, tx ${truncate(broadcast.data.txnHash, 26)}`, 'ok')

    setStep('step-verify', 'Waiting for the transaction to be mined...', 'run')
    const document = await resolveWithRetry(state.did)
    if (document && document.id === state.did) {
      setStep('step-verify', `GET /resolve-did/${truncate(state.did)} - the document is on chain`, 'ok')
    } else {
      setStep(
        'step-verify',
        'Transaction sent, but the document is not readable yet - retry the resolve in a moment',
        'skip'
      )
    }
  } catch (error) {
    const running = steps.map((id) => $(id)).find((element) => element.dataset.state === 'run')
    if (running) setStep(running.id, `${running.dataset.label} - ${error.message}`, 'err')
    else setStep('step-intent', error.message, 'err')

    if (isFundingError(error.message)) showFundingHelp()
  }
}

/**
 * The address that must hold gas. In the keyless flow that is whichever key
 * signs, so the wallet address wins when a wallet did the signing.
 */
const signingAddress = () => state.walletAddress ?? state.did.split(':').pop() ?? ''

/**
 * A funding problem is the one broadcast failure a visitor can actually fix, so
 * it gets an explanation and a faucet link rather than a bare error string. The
 * message comes back as a JSON-RPC error, hence the loose match.
 */
const isFundingError = (message) => /insufficient funds|INSUFFICIENT_FUNDS|gas \* price|balance 0/i.test(message)

const showFundingHelp = () => {
  const address = signingAddress()
  $('funding-address').textContent = address || 'unknown - generate an identity first'
  $('funding-help').hidden = false
  $('funding-help').scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

const hideFundingHelp = () => {
  $('funding-help').hidden = true
}

const resolveWithRetry = async (did, attempts = 6, delayMs = 2500) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(apiUrl(`/resolve-did/${encodeURI(did)}`))
    if (response.ok) {
      const document = await response.json()
      if (document?.id) return document
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return null
}

/* ------------------------------------------------------------- endpoints */

const ENDPOINTS = [
  {
    method: 'POST',
    path: '/create-did',
    description: 'Generate a key pair, DID and document. Local only - no transaction.',
    body: () => ({ networkType: 'testnet' }),
  },
  {
    method: 'POST',
    path: '/register-did',
    description: 'Custodial: registers the document, building it from the private key when omitted.',
    body: () => ({ did: state.did, privateKey: state.privateKey, didDoc: parseDoc() }),
  },
  {
    method: 'POST',
    path: '/tx-intent',
    description: 'Keyless: the unsigned create/update transaction. No key in the request.',
    body: () => ({ operation: 'create', did: state.did, didDoc: parseDoc() }),
  },
  {
    method: 'POST',
    path: '/broadcast',
    description: 'Keyless: relay a transaction signed locally. Guards against wrong target and unknown methods.',
    body: () => ({ signedTx: '0x02f8... (sign a /tx-intent response locally)' }),
  },
  {
    method: 'PATCH',
    path: '/update-did/{did}',
    description: 'Custodial: replaces the stored document. The private key travels in the body, never the URL.',
    pathFor: () => `/update-did/${encodeURI(state.did)}`,
    body: () => ({ privateKey: state.privateKey, didDoc: parseDoc() }),
  },
  {
    method: 'GET',
    path: '/resolve-did/{did}',
    description: 'Read a DID document from the chain. An unresolvable DID answers 200 with an empty body.',
    pathFor: () => `/resolve-did/${encodeURI(state.did)}`,
    body: null,
  },
  {
    method: 'DELETE',
    path: '/delete-did/...',
    description: 'Removed: neither the registrar library nor the registry contract supports deleting a DID.',
    body: null,
    expectedStatus: 404,
  },
]

const renderEndpoints = () => {
  const list = $('endpoint-list')
  list.textContent = ''

  for (const endpoint of ENDPOINTS) {
    const card = document.createElement('div')
    card.className = 'endpoint'

    const head = document.createElement('div')
    head.className = 'endpoint-head'
    const method = document.createElement('span')
    method.className = `method ${endpoint.method.toLowerCase()}`
    method.textContent = endpoint.method
    const path = document.createElement('span')
    path.className = 'path'
    path.textContent = endpoint.path
    const send = document.createElement('button')
    send.className = 'ghost small'
    send.textContent = 'Send'
    send.style.marginLeft = 'auto'
    head.append(method, path, send)

    const hint = document.createElement('p')
    hint.className = 'hint'
    hint.textContent = endpoint.description

    card.append(head, hint)

    let textarea
    if (endpoint.body) {
      textarea = document.createElement('textarea')
      textarea.rows = 5
      textarea.spellcheck = false
      card.append(textarea)
    }

    const result = document.createElement('pre')
    result.className = 'result'
    result.hidden = true

    send.addEventListener('click', async () => {
      const target = endpoint.pathFor ? endpoint.pathFor() : endpoint.path
      let body
      try {
        if (endpoint.body) {
          body = JSON.parse(textarea.value)
        }
      } catch (error) {
        result.hidden = false
        setResult(result, `The request body is not valid JSON: ${error.message}`, true)
        return
      }

      send.disabled = true
      try {
        const payload = await api(endpoint.method, target, body)
        result.hidden = false
        const status = endpoint.expectedStatus ?? (endpoint.method === 'GET' ? 200 : 201)
        setResult(result, payload === null ? '(empty body, HTTP 200)' : payload)
        result.dataset.status = String(status)
      } catch (error) {
        result.hidden = false
        setResult(result, { success: false, message: error.message }, true)
      } finally {
        send.disabled = false
      }
    })

    card.append(result)

    if (endpoint.body) {
      const prefill = () => {
        try {
          textarea.value = json(endpoint.body())
        } catch (error) {
          // The body can depend on an identity that has not been generated yet.
          result.hidden = false
          setResult(result, error.message, true)
        }
      }
      prefill()
      hint.append(' ')
      const fill = document.createElement('button')
      fill.className = 'ghost small'
      fill.textContent = 'Fill with the identity above'
      fill.addEventListener('click', prefill)
      card.querySelector('.endpoint-head').append(fill)
    }

    list.append(card)
  }
}

/* -------------------------------------------------------------- wiring */

const refreshWalletStatus = async () => {
  const pill = $('wallet-status')
  if (!window.ethereum) {
    pill.textContent = 'wallet: not detected'
    return
  }
  try {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' })
    pill.textContent = accounts.length > 0 ? `wallet: ${truncate(accounts[0], 10)}` : 'wallet: connected, locked'
  } catch {
    pill.textContent = 'wallet: unavailable'
  }
}

const wire = () => {
  $('generate').addEventListener('click', generateIdentity)
  $('load-sample').addEventListener('click', loadSample)

  $('reveal').addEventListener('click', () => {
    const input = $('privateKey')
    const hidden = input.type === 'password'
    input.type = hidden ? 'text' : 'password'
    $('reveal').textContent = hidden ? 'Hide key' : 'Reveal key'
  })

  $('copy-key').addEventListener('click', async () => {
    await navigator.clipboard.writeText(state.privateKey)
    $('copy-key').textContent = 'Copied'
    setTimeout(() => {
      $('copy-key').textContent = 'Copy key'
    }, 1200)
  })

  $('copy-doc').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('didDoc').value)
    $('copy-doc').textContent = 'Copied'
    setTimeout(() => {
      $('copy-doc').textContent = 'Copy JSON'
    }, 1200)
  })

  $('build-doc').addEventListener('click', () => {
    if (!state.privateKey) return
    const did = $('did').value.trim()
    state.did = did
    applyIdentity({ did, didDoc: buildDocumentLocally(did, state.privateKey) })
    try {
      state.walletAddress = computeAddress(state.privateKey)
    } catch {
      state.walletAddress = null
    }
    renderIdentityMeta()
  })

  $('did').addEventListener('input', (event) => {
    state.did = event.target.value.trim()
    try {
      state.walletAddress = state.privateKey ? computeAddress(state.privateKey) : null
    } catch {
      state.walletAddress = null
    }
    renderIdentityMeta()
  })

  $('privateKey').addEventListener('input', (event) => {
    state.privateKey = event.target.value.trim()
    try {
      state.walletAddress = computeAddress(state.privateKey)
    } catch {
      state.walletAddress = null
    }
    renderIdentityMeta()
  })

  $('run-keyless').addEventListener('click', () => runKeyless('in-browser key'))
  $('signer-wallet').addEventListener('click', () => runKeyless('wallet'))

  $('copy-address').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('funding-address').textContent)
    $('copy-address').textContent = 'Copied'
    setTimeout(() => {
      $('copy-address').textContent = 'Copy'
    }, 1200)
  })

  // Re-running is the same flow, and it re-reads the nonce, so a funded address
  // does not need a fresh intent built by hand.
  $('retry-keyless').addEventListener('click', () => runKeyless('in-browser key'))
  $('run-resolve').addEventListener('click', async () => {
    try {
      const document = await api('GET', `/resolve-did/${encodeURI(state.did)}`)
      state.didDoc = document
      $('didDoc').value = json(document)
      syncOperationToChainState(document)
    } catch (error) {
      alert(`Resolve failed: ${error.message}`)
    }
  })

  $('run-register').addEventListener('click', async () => {
    await guardedCustodial('POST', '/register-did', {
      did: state.did,
      privateKey: state.privateKey,
      didDoc: parseDoc(),
    })
  })

  $('run-update').addEventListener('click', async () => {
    await guardedCustodial('PATCH', `/update-did/${encodeURI(state.did)}`, {
      privateKey: state.privateKey,
      didDoc: parseDoc(),
    })
  })

  $('clear-log').addEventListener('click', () => {
    $('log').textContent = ''
  })

  window.ethereum?.on?.('accountsChanged', refreshWalletStatus)
  refreshWalletStatus()
  // The identity has to exist before the endpoint cards prefill their bodies,
  // since those bodies embed the DID document.
  generateIdentity()
  renderEndpoints()
}

const guardedCustodial = async (method, path, body) => {
  const confirmed = window.confirm(
    'This sends your private key to the API so the server can sign for you.\n\n' +
      'It exists for demo parity - the keyless flow above does the same thing without sharing the key.\n\n' +
      'Send the key anyway?'
  )
  if (!confirmed) return
  try {
    await api(method, path, body)
  } catch (error) {
    alert(`${method} ${path} failed: ${error.message}`)
  }
}

for (const id of ['step-intent', 'step-sign', 'step-broadcast', 'step-verify']) {
  const labels = {
    'step-intent': 'POST /tx-intent - not started',
    'step-sign': 'Sign locally - not started',
    'step-broadcast': 'POST /broadcast - not started',
    'step-verify': 'GET /resolve-did - not started',
  }
  const element = $(id)
  if (!element) continue
  element.dataset.label = labels[id]
  setStep(id, labels[id], 'idle')
}

wire()
