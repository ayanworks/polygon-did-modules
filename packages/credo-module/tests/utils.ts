import { AskarModule, type AskarModuleConfigStoreOptions } from '@credo-ts/askar'
import type { AgentDependencies, EmptyModuleMap, InitConfig, InjectionToken } from '@credo-ts/core'
import { AgentConfig, AgentContext, ConsoleLogger, DependencyManager, DidsModule, Kms, LogLevel, utils } from '@credo-ts/core'
import { KeyManagementApi, type KeyManagementService } from '@credo-ts/core/kms'
import { DidCommModule, type DidCommModuleConfigOptions } from '@credo-ts/didcomm'
import { agentDependencies, NodeInMemoryKeyManagementStorage, NodeKeyManagementService } from '@credo-ts/node'
import { askar } from '@openwallet-foundation/askar-nodejs'
import { PolygonDidRegistrar, PolygonDidResolver } from '../src/dids'
import { PolygonModule } from '../src/PolygonModule'

const testLogger = new ConsoleLogger(LogLevel.off)

export function getAskarStoreConfig(
  name: string,
  {
    inMemory = true,
    random = utils.uuid().slice(0, 4),
    maxConnections,
  }: { inMemory?: boolean; random?: string; maxConnections?: number } = {}
) {
  return {
    id: `Wallet: ${name} - ${random}`,
    key: 'DZ9hPqFWTPxemcGea72C1X1nusqk5wFNLq6QPjwXGqAa', // generated using indy.generateWalletKey
    keyDerivationMethod: 'raw',
    database: {
      type: 'sqlite',
      config: {
        inMemory,
        maxConnections,
      },
    },
  } satisfies AskarModuleConfigStoreOptions
}

export function getAgentOptions<
  AgentModules extends EmptyModuleMap,
  RequireDidComm extends boolean | undefined = undefined,
  // biome-ignore lint/complexity/noBannedTypes: no explanation
  DidCommConfig extends DidCommModuleConfigOptions = {},
>(
  name: string,
  didcommConfig?: DidCommConfig,
  extraConfig: Partial<InitConfig> = {},
  inputModules?: AgentModules,
  {
    requireDidcomm,
    inMemory = true,
  }: { requireDidcomm?: RequireDidComm; inMemory?: boolean; } = {}
): {
  config: InitConfig
  // biome-ignore lint/complexity/noBannedTypes: no explanation
  modules: (RequireDidComm extends true ? { didcomm: DidCommModule<DidCommConfig> } : {}) &
  AgentModules
  dependencies: AgentDependencies
  inMemory?: boolean
} {
  const config: InitConfig = {
    // TODO: determine the log level based on an environment variable. This will make it
    // possible to run e.g. failed github actions in debug mode for extra logs
    logger: testLogger,
    ...extraConfig,
  }

  const m = (inputModules ?? {})

  const _modules = {
    ...(requireDidcomm
      ? {
        didcomm: new DidCommModule({
          connections: {
            autoAcceptConnections: true,
          },
          ...didcommConfig,
        }),
      }
      : {}),
    ...m,

    askar: new AskarModule({
      askar,
      store: getAskarStoreConfig(name, { inMemory }),
    }),

    polygon: new PolygonModule({
      rpcUrl: 'https://rpc-amoy.polygon.technology',
      didContractAddress: '0xC1c392DC1073a86821B4ae37f1F0faCDcFFf45bF',
      fileServerToken:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJBeWFuV29ya3MiLCJpZCI6IjdmYjRmN2I3LWQ5ZWUtNDYxOC04OTE4LWZiMmIzYzY1M2EyYiJ9.x-kHeTVqX4w19ibSAspCYgIL-JFVss8yZ0CT21QVRYM',
      schemaManagerContractAddress: '0x289c7Bd4C7d38cC54bff370d6f9f01b74Df51b11',
      serverUrl: 'https://51e1-103-97-166-226.ngrok-free.app',
    }),
    dids: new DidsModule({
      resolvers: [new PolygonDidResolver()],
      registrars: [new PolygonDidRegistrar()],
    }),
  }

  return {
    config,
    modules:
      // biome-ignore lint/complexity/noBannedTypes: no explanation
      _modules as unknown as (RequireDidComm extends true ? { didcomm: DidCommModule<DidCommConfig> } : {}) &
      AgentModules,
    dependencies: agentDependencies,
  } as const
}

export function getAgentConfig(
  name: string,
  didcommConfig: Partial<DidCommModuleConfigOptions> = {},
  extraConfig: Partial<InitConfig> = {}
): AgentConfig {
  const { config, dependencies } = getAgentOptions(name, didcommConfig, extraConfig)
  return new AgentConfig(config, dependencies)
}

export function getAgentContext({
  dependencyManager = new DependencyManager(),
  agentConfig,
  contextCorrelationId = 'mock',
  registerInstances = [],
  kmsBackends = [new NodeKeyManagementService(new NodeInMemoryKeyManagementStorage())],
  isRootAgentContext = true,
}: {
  dependencyManager?: DependencyManager
  agentConfig?: AgentConfig
  contextCorrelationId?: string
  kmsBackends?: KeyManagementService[]
  // Must be an array of arrays as objects can't have injection tokens
  // as keys (it must be number, string or symbol)
  registerInstances?: Array<[InjectionToken, unknown]>
  isRootAgentContext?: boolean
} = {}) {
  if (agentConfig) dependencyManager.registerInstance(AgentConfig, agentConfig)

  // Register custom instances on the dependency manager
  for (const [token, instance] of registerInstances.values()) {
    dependencyManager.registerInstance(token, instance)
  }

  const agentContext = new AgentContext({ dependencyManager, contextCorrelationId, isRootAgentContext })
  agentContext.dependencyManager.registerInstance(
    Kms.KeyManagementModuleConfig,
    new Kms.KeyManagementModuleConfig({
      backends: kmsBackends,
    })
  )
  agentContext.dependencyManager.registerContextScoped(KeyManagementApi)

  agentContext.dependencyManager.registerInstance(AgentContext, agentContext)
  return agentContext
}
