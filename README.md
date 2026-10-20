#  Polygon DID Modules

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

A comprehensive suite of modules for implementing Polygon-based Decentralized Identifiers (DIDs) with W3C compliance, enabling secure identity management on the Polygon blockchain network.


## Packages

This monorepo contains the following packages:

| Package | Description | Version |
|---------|-------------|---------|
| `credo-module` | Credo framework integration module | ![npm](https://img.shields.io/npm/v/@ayanworks/credo-polygon-w3c-module) |
| `did-resolver` | Polygon DID resolver implementation | ![npm](https://img.shields.io/npm/v/@ayanworks/polygon-did-resolver) |
| `did-registrar` | DID registration and management | ![npm](https://img.shields.io/npm/v/@ayanworks/polygon-did-registrar) |
| `schema-manager` | W3C schema management utilities | ![npm](https://img.shields.io/npm/v/@ayanworks/polygon-schema-manager) |
| `did-registry-contract` | Smart contract for DID registry | ![npm](https://img.shields.io/npm/v/@ayanworks/polygon-did-registry-contract) |


## Apps

| App | Description |
|-----|-------------|
| `demo-api` | Demo REST API (`create`/`register`/`resolve`/`update` DID) with Swagger UI **and a browser playground**, consuming the packages in this workspace via `workspace:*` - see [apps/demo-api](./apps/demo-api) |


### Running the demo

The demo app serves three surfaces from one Express process on one port, so a single command is all
you need:

```bash
pnpm install
pnpm build
pnpm --filter @ayanworks/polygon-did-demo-api dev
```

Then open:

- **Playground UI** - <http://localhost:8081/> - generate an identity in the browser and exercise every
  endpoint, including the keyless flow where the private key never leaves the page.
- **Swagger UI** - <http://localhost:8081/index> - the REST contract.
- **REST API** - <http://localhost:8081/> - `curl http://localhost:8081/config` to confirm it is up.

Defaults to the Amoy testnet on port `8081`; override with `PORT`, `POLYGON_RPC_URL` and
`POLYGON_CONTRACT_ADDRESS`. See [apps/demo-api/README.md](./apps/demo-api/README.md) for the endpoint
reference and the local-signing walkthrough.


### Setup

```bash
# Clone the repository
git clone https://github.com/ayanworks/polygon-did-modules.git

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type checking
pnpm types:check

# Code formatting
pnpm style:fix
```


