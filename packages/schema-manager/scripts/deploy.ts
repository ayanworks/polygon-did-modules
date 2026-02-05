import { ethers, upgrades } from 'hardhat'

async function main() {
  // biome-ignore lint/suspicious/noConsole: deploy script output
  console.log('Deploying the smart contract...')
  const SchemaRegistry = await ethers.getContractFactory('SchemaRegistry')
  const contract = await upgrades.deployProxy(SchemaRegistry, { initializer: 'initialize' })
  await contract.waitForDeployment()
  // biome-ignore lint/suspicious/noConsole: deploy script output
  console.log('Contract address::', contract.target)
}

main().catch((error: unknown) => {
  // biome-ignore lint/suspicious/noConsole: deploy script output
  console.error('Error deploying contract:', error)
  process.exitCode = 1
})
