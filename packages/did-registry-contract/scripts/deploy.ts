import { ethers, upgrades } from 'hardhat'

async function main() {
  // biome-ignore lint/suspicious/noConsole: deploy script output
  console.log('Deploying the smart contract...')
  const PolygonDidRegistry = await ethers.getContractFactory('PolygonDidRegistry')
  const contract = await upgrades.deployProxy(PolygonDidRegistry, { initializer: 'initialize' })
  await contract.waitForDeployment()
  // biome-ignore lint/suspicious/noConsole: deploy script output
  console.log('Contract address::', contract.target)
}

main().catch((error: unknown) => {
  // biome-ignore lint/suspicious/noConsole: deploy script output
  console.error('Error deploying contract:', error)
  process.exitCode = 1
})
