import express, { Request, Response } from 'express'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import * as yaml from 'js-yaml'
import { readFileSync } from 'fs'
import { join } from 'path'
import { prisma } from '../lib/db'
import 'dotenv/config'

const app = express()
app.use(cors())

const PORT = Number(process.env.REPORTING_PORT) || 3001

const swaggerDocument = yaml.load(
  readFileSync(join(__dirname, '../../docs/reporting.yaml'), 'utf8'),
) as any

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

interface StatsResponse {
  site_id: string
  date?: string
  total_views: number
  unique_users: number
  top_paths: Array<{ path: string; views: number }>
}

app.get('/stats', async (req: Request, res: Response<StatsResponse | { error: string }>) => {
  const { site_id, date } = req.query
  if (!site_id || typeof site_id !== 'string') {
    return res.status(400).json({ error: 'site_id required' })
  }

  const where = {
    siteId: site_id,
    eventType: 'page_view',
    ...(date && {
      timestamp: {
        gte: new Date(date as string),
        lt: new Date(new Date(date as string).getTime() + 24 * 60 * 60 * 1000),
      },
    }),
  }

  try {
    const totalViews = await prisma.event.count({ where })
    const uniqueUsers = new Set(
      (await prisma.event.findMany({ where, select: { userId: true } })).map((e: any) => e.userId),
    ).size

    const topPaths = await prisma.event
      .groupBy({
        by: ['path'],
        where,
        _count: { path: true },
        orderBy: { _count: { path: 'desc' } },
        take: 3,
      })
      .then((groups: any) => groups.map((g: any) => ({ path: g.path, views: g._count.path })))

    res.json({
      site_id,
      ...(date && { date: date as string }),
      total_views: totalViews,
      unique_users: uniqueUsers,
      top_paths: topPaths,
    })
  } catch (err) {
    console.error('Query error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.listen(PORT, () => {
  console.log(`Reporting service on port ${PORT}`)
})
