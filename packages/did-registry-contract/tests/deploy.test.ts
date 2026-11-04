import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const run = promisify(execFile)
const packageRoot = process.cwd()

interface Artifact {
  abi: Array<{ type: string; name?: string }>
}

describe('deploy script', () => {
  it('deploys an upgradeable proxy on the built-in network', async () => {
    const { stdout } = await run('pnpm', ['exec', 'hardhat', 'run', 'scripts/deploy.ts'], {
      cwd: packageRoot,
      timeout: 120_000,
    })

    expect(stdout).toContain('Deploying the smart contract...')
    expect(stdout).toMatch(/Contract address:: 0x[0-9a-fA-F]{40}/)
  }, 120_000)
})

describe('compiled artifact', () => {
  it('keeps the published artifact path and public ABI', async () => {
    const artifactPath = join(packageRoot, 'artifacts/contracts/PolygonDidRegistry.sol/PolygonDidRegistry.json')
    const artifact = JSON.parse(await readFile(artifactPath, 'utf8')) as Artifact
    const functions = artifact.abi.filter((item) => item.type === 'function').map((item) => item.name)

    expect(functions).toEqual(
      expect.arrayContaining([
        'initialize',
        'createDID',
        'updateDIDDoc',
        'getDIDDoc',
        'addResource',
        'getResource',
        'getAllResources',
        'transferOwnership',
        'getOwner',
      ])
    )
  })
})
