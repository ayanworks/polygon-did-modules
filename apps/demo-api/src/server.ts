import 'dotenv/config'
import app from './app'
import { config } from './config'

app.listen(config.port, () => {})
