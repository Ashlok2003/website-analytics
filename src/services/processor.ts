import { Worker } from 'bullmq'
import { prisma } from '../lib/db'
import { connection } from '../lib/queue'
import { EventInput } from '../lib/validator'

const worker = new Worker<EventInput>(
  'events',
  async (job) => {
    const { site_id, event_type, path, user_id, timestamp } = job.data
    await prisma.event.create({
      data: {
        siteId: site_id,
        eventType: event_type,
        path,
        userId: user_id,
        timestamp: new Date(timestamp),
      },
    })
    console.log(`Processed event for site ${site_id}`)
  },
  { connection },
)

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err)
})

console.log('Processor worker started')
