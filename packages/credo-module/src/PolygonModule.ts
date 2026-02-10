import {
  type DependencyManager,
  type Module,
  SignatureSuiteToken,
  type SuiteInfo,
  VERIFICATION_METHOD_TYPE_ECDSA_SECP256K1_VERIFICATION_KEY_2019,
} from '@credo-ts/core'
import { Secp256k1PublicJwk } from '@credo-ts/core/kms'
import { PolygonLedgerService } from './ledger'
import { PolygonApi } from './PolygonApi'
import type { PolygonModuleConfigOptions } from './PolygonModuleConfig'
import { PolygonModuleConfig } from './PolygonModuleConfig'
import { EcdsaSecp256k1Signature2019 } from './signature-suites'

export class PolygonModule implements Module {
  public readonly config: PolygonModuleConfig
  public readonly api = PolygonApi

  public constructor(options: PolygonModuleConfigOptions) {
    this.config = new PolygonModuleConfig(options)
  }

  public register(dependencyManager: DependencyManager) {
    // Warn about experimental module
    dependencyManager.registerInstance(PolygonModuleConfig, this.config)

    // Services
    dependencyManager.registerSingleton(PolygonLedgerService)

    // Api
    dependencyManager.registerContextScoped(PolygonApi)

    // Signature suites.
    dependencyManager.registerInstance(SignatureSuiteToken, {
      suiteClass: EcdsaSecp256k1Signature2019,
      proofType: 'EcdsaSecp256k1Signature2019',
      verificationMethodTypes: [VERIFICATION_METHOD_TYPE_ECDSA_SECP256K1_VERIFICATION_KEY_2019],
      supportedPublicJwkTypes: [Secp256k1PublicJwk],
    } satisfies SuiteInfo)
  }
}
