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


