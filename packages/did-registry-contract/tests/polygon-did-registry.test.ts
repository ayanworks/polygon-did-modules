import type { Contract } from 'ethers'
import { ethers, upgrades } from 'hardhat'
import { beforeAll, describe, expect, it } from 'vitest'

let contract: Contract
let signerAddress: string

const didDoc = JSON.stringify({
  '@context': 'https://w3id.org/did/v1',
  id: 'did:polygon:placeholder',
  verificationMethod: [
    {
      id: 'did:polygon:placeholder',
      type: 'EcdsaSecp256k1VerificationKey2019',
      controller: 'did:polygon:placeholder',
      publicKeyBase58: 'NDaEdTguJV39Ns8BZkxQ3XR6GUinZAJfVoyEMkK9fP7XQmpSkT3UsLHB52cFpDqoM6m4Hevtba8pkmjvEG3Ur7ji',
    },
  ],
})

const updatedDidDoc = JSON.stringify({
  '@context': 'https://w3id.org/did/v1',
  id: 'did:polygon:placeholder',
  verificationMethod: [
    {
      id: 'did:polygon:placeholder',
      type: 'EcdsaSecp256k1VerificationKey2019',
      controller: 'did:polygon:updated-controller',
      publicKeyBase58: 'NDaEdTguJV39Ns8BZkxQ3XR6GUinZAJfVoyEMkK9fP7XQmpSkT3UsLHB52cFpDqoM6m4Hevtba8pkmjvEG3Ur7ji',
    },
  ],
})

describe('PolygonDidRegistry', () => {
  beforeAll(async () => {
    const [signer] = await ethers.getSigners()
    signerAddress = signer.address

    const PolygonDidRegistry = await ethers.getContractFactory('PolygonDidRegistry')
    contract = await upgrades.deployProxy(PolygonDidRegistry, { initializer: 'initialize' })
    await contract.waitForDeployment()
  }, 30_000)

  it('should deploy contract with proxy', () => {
    expect(contract.target).toBeTruthy()
  })

  it('should create a DID and read it back', async () => {
    await contract.createDID(signerAddress, didDoc)
    const result = await contract.getDIDDoc(signerAddress)
    expect(result[0]).toBe(didDoc)
  }, 30_000)

  it('should update a DID document', async () => {
    await contract.updateDIDDoc(signerAddress, updatedDidDoc)
    const result = await contract.getDIDDoc(signerAddress)
    expect(result[0]).toBe(updatedDidDoc)
  }, 30_000)

  it('should fail update with wrong controller', async () => {
    const wrongDid = '0x2f65b747440deaf596892dfc7965040be8b99109'
    await expect(contract.updateDIDDoc(wrongDid, updatedDidDoc)).rejects.toThrow()
  }, 30_000)

  it('should transfer ownership', async () => {
    const newOwner = '0x2f65b747440deaf596892dfc7965040be8b99109'
    const ownerBefore = await contract.getOwner()
    await contract.transferOwnership(newOwner)
    const ownerAfter = await contract.getOwner()
    expect(ownerAfter).not.toBe(ownerBefore)
    expect(ownerAfter.toLowerCase()).toBe(newOwner.toLowerCase())
  }, 30_000)

  it('should fail transfer from non-owner', async () => {
    const anotherAddress = '0x2f65b747440deaf596892dfc7965040be8b99100'
    await expect(contract.transferOwnership(anotherAddress)).rejects.toThrow()
  }, 30_000)

  it('should add and retrieve a linked resource', async () => {
    const resourceId = 'resource-1'
    const resourcePayload = JSON.stringify({ type: 'schema', data: 'test-resource' })

    await contract.addResource(signerAddress, resourceId, resourcePayload)
    const resource = await contract.getResource(signerAddress, resourceId)
    expect(resource).toBe(resourcePayload)

    const allResources = await contract.getAllResources(signerAddress)
    expect(allResources).toContain(resourcePayload)
  }, 30_000)
})
