import cors from 'cors'
import type { Express } from 'express'
import express from 'express'
import swaggerUi from 'swagger-ui-express'
import swaggerDocument from '../swagger.json'
import { Broadcast } from './routes/broadcast'
import { CreateDid } from './routes/create-did'
import { RegisterDid } from './routes/register-did'
import { ResolveDid } from './routes/resolve-did'
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

  public constructor() {
    this.app = express()
    this.config()

    this.createDidRoutes.routes(this.app)
    this.registerDidRoutes.routes(this.app)
    this.resolveDidRoutes.routes(this.app)
    this.updateDidRoutes.routes(this.app)
    this.txIntentRoutes.routes(this.app)
    this.broadcastRoutes.routes(this.app)
  }

  private config(): void {
    this.app.use('/index', swaggerUi.serve, swaggerUi.setup(swaggerDocument))
    this.app.use(express.json())
    this.app.use(express.urlencoded({ extended: false }))
    this.app.use(cors())
  }
}

export default new App().app
