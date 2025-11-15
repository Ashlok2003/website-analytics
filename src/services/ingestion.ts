import express, { Request, Response } from 'express'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import * as yaml from 'js-yaml'
import { readFileSync } from 'fs'
import { join } from 'path'
import { eventQueue } from '../lib/queue'
import { eventSchema } from '../lib/validator'
import 'dotenv/config'

const app = express()
app.use(cors({ origin: '*' }))
app.use(express.json())

const PORT = Number(process.env.INGESTION_PORT) || 3000

const swaggerDocument = yaml.load(
  readFileSync(join(__dirname, '../../docs/ingestion.yaml'), 'utf8'),
) as any

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

app.post('/event', async (req: Request, res: Response) => {
  const result = eventSchema.safeParse(req.body)
  if (!result.success) {
    return res.status(400).json({ error: result.error.message })
  }

  try {
    await eventQueue.add('process-event', result.data)
    res.json({ success: true, message: 'Event queued' })
  } catch (err) {
    console.error('Queue error:', err)
    res.status(500).json({ error: 'Failed to queue event' })
  }
})

app.listen(PORT, () => {
  console.log(`Ingestion service on port ${PORT}`)
})
