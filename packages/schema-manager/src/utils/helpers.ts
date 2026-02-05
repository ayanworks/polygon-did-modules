
import keccak256 from 'keccak256'
import { parseDid } from './did'

/**
 * Build schema JSON.
 * @param did
 * @param schemaId
 * @param name
 * @returns Returns the build schema resource Document.
 */
export async function buildSchemaResource(
  did: string,
  schemaId: string,
  name: string,
  schema: object,
) {
  const checksum = await keccak256(String(schema)).toString('hex')
  if (!checksum) {
    throw new Error(`Error while calculating checksum!`)
  }

  return {
    resourceURI: `${did}/resources/${schemaId}`,
    resourceCollectionId: parseDid(did).didAddress,
    resourceId: `${schemaId}`,
    resourceName: `${name}`,
    resourceType: 'W3C-schema',
    mediaType: '',
    created: new Date().toISOString(),
    checksum,
    previousVersionId: '',
    nextVersionId: '',
  }
}