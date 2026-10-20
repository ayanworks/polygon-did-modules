import path from 'node:path'
import cors from 'cors'
import type { Express } from 'express'
import express from 'express'
import swaggerUi from 'swagger-ui-express'
import swaggerDocument from '../swagger.json'
import { config } from './config'
import { Broadcast } from './routes/broadcast'
import { CreateDid } from './routes/create-did'
import { RegisterDid } from './routes/register-did'
import { ResolveDid } from './routes/resolve-did'
import { Schemas } from './routes/schemas'
import { TxIntent } from './routes/tx-intent'
import { UpdateDid } from './routes/update-did'

class App {
  public app: Express

  public createDidRoutes: CreateDid = new CreateDid()
  public registerDidRoutes: RegisterDid = new RegisterDid()
  public resolveDidRoutes: ResolveDid = new ResolveDid()
  public updateDidRoutes: UpdateDid = new UpdateDid()
  public txIntentRoutes: TxIntent = new TxIntent()
  public broadcastRoutes: Broadcast = new Broadcast()
  public schemasRoutes: Schemas = new Schemas()

  public constructor() {
    this.app = express()
    this.config()

    this.createDidRoutes.routes(this.app)
    this.registerDidRoutes.routes(this.app)
    this.resolveDidRoutes.routes(this.app)
    this.updateDidRoutes.routes(this.app)
    this.txIntentRoutes.routes(this.app)
    this.broadcastRoutes.routes(this.app)
    this.schemasRoutes.routes(this.app)
  }

  private config(): void {
    this.app.use('/index', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

    // The network this instance is wired to. Public information, and it lets the
    // playground show what a visitor is actually talking to.
    this.app.get('/config', (_req, res) => {
      res.status(200).json({
        success: true,
        data: {
          rpcUrl: config.rpcUrl,
          contractAddress: config.contractAddress,
          schemaManagerContractAddress: config.schemaManagerContractAddress,
          serverUrl: config.serverUrl,
        },
      })
    })

    this.app.use(express.json())
    this.app.use(express.urlencoded({ extended: false }))
    this.app.use(cors())

    // The playground UI, mounted after the API routes so /create-did and friends
    // keep priority. Only the root serves the page: unknown paths stay 404s
    // rather than turning API mistakes into an HTML response.
    const publicDir = path.join(import.meta.dirname, '..', 'public')
    this.app.use(express.static(publicDir))
    this.app.get('/', (_req, res) => {
      res.sendFile(path.join(publicDir, 'index.html'))
    })
  }
}

export default new App().app
