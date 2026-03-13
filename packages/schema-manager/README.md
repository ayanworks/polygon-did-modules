# Polygon schema registrar

This GitHub repository is dedicated to creating W3C-compliant schemas for JSON-LD credentials, facilitating interoperability and standardization in digital credentialing.
Methods

## Contract Deployment

|        Network         | ChainId |              Contract Address              |
| :--------------------: | :-----: | :----------------------------------------: |
|    Polygon Mainnet     |   137   | 0x4B16719E73949a62E9A7306F352ec73F1B143c27 |
| Polygon Testnet (amoy) |  80002  | 0x4742d43C2dFCa5a1d4238240Afa8547Daf87Ee7a |

### Example of Polygon JSON-LD Schema:

```json
{
  "resourceURI": "did:polygon:testnet:0x13cd23928Ae515b86592C630f56C138aE4c7B79a/resources/398cee0a-efac-4643-9f4c-74c48c72a14b",
  "resourceCollectionId": "55dbc8bf-fba3-4117-855c-1e0dc1d3bb47",
  "resourceId": "398cee0a-efac-4643-9f4c-74c48c72a14b",
  "resourceName": "PANCARD",
  "resourceType": "W3C-schema",
  "mediaType": "txt",
  "created": "2022-11-17T08:10:36Z",
  "checksum": "a95380f460e63ad939541a57aecbfd795fcd37c6d78ee86c885340e33a91b559",
  "previousVersionId": null,
  "nextVersionId": null
}
```

# Schema Operations

## Create Schema

Create a new JSON-LD credential schema. This method allows users to define the structure and properties of the credential schema.

```js
import { createSchema } from 'polygon-schema-manager'
const txDetails = await createSchema(did, schemaName, schema)
```

The function returns, did, schemaId,and txnReceipt.

## Get Schema by ID

Retrieves schema details by its unique ID.

```js
import { getSchemaById } from 'polygon-schema-manager'
const schemaDetail = await getSchemaById(did, schemaId)
```

The function returns Schema details including resourceURI, resourceCollectionId, etc..

## Get All Schemas by DID

Retrieves all schemas associated with a specific DID.

```js
import { getSchemaById } from 'polygon-schema-manager'
const schemaDetails = await getSchemaById(did)
```

The function returns Array of schema objects with essential keys..

## Estimate Transaction

Estimates transaction fees for schema-related transactions.

```js
import { estimateTxFee } from 'polygon-schema-manager'
const transactionDetails = await getSchemaById(did)
```

The function returns transaction details including transactionFee, gasLimit, etc.

## Validate Schema Object

Validates the JSON schema object to ensure its correctness.

```js
import { estimateTxFee } from 'polygon-schema-manager'
const transactionDetails = await getSchemaById(did)
```

The function returns boolean indicating whether the schema is valid.