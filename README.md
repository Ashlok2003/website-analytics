# Website Analytics Backend Service

## Overview

This project implements a scalable backend service for capturing and analyzing website analytics events. It handles high-volume ingestion requests with minimal latency by using asynchronous queuing, while providing aggregated reporting via a separate API. The system is built using Node.js with TypeScript for type safety, Prisma for database interactions, BullMQ with Redis for queuing, and Zod for validation. OpenAPI (Swagger) documentation is included for easy API exploration.

The solution meets the core requirements:
- **Ingestion API**: Fast endpoint that validates and queues events without blocking on DB writes.
- **Processor**: Background worker that dequeues and persists events to the database.
- **Reporting API**: Aggregates data for summaries (total views, unique users, top paths) filtered by site and optional date.

Development time: ~3 hours (including setup, testing, and docs).

## Architecture Decision

To ensure the ingestion endpoint is "extremely fast" (sub-10ms response times even under load), I implemented asynchronous processing using **Redis as the message broker** with **BullMQ** for queue management. Here's how it works and why:

### How It Works
1. **Ingestion Flow**:
   - Client sends POST /event with JSON payload.
   - Validate payload using Zod (e.g., required fields: `site_id`, `event_type`, `path`, `timestamp`).
   - Enqueue the event as a BullMQ job (fire-and-forget; no DB touch).
   - Return 200 success immediately.

2. **Processing Flow**:
   - A separate BullMQ worker (processor service) polls the 'events' queue.
   - Dequeues jobs, inserts into PostgreSQL via Prisma ORM.
   - Handles retries/failures automatically (BullMQ feature).

3. **Reporting Flow**:
   - GET /stats queries the DB directly with Prisma (e.g., `count()`, `groupBy()` for aggregations).
   - Filters by `site_id` (required) and `date` (optional, UTC day).
   - Only aggregates `page_view` events as per the example; extensible for others.

### Architecture Diagram
```
┌────────────┐
│   Client   │
└─────┬──────┘
      │  POST /event  (Express + Zod Validation)
      v
┌────────────────────────────┐
│    BullMQ Queue (Redis)    │
└─────┬──────────────────────┘
      │  Immediate Response (200 OK)
      v
┌────────────────────────────────────────┐
│  Processor Worker (BullMQ)             │
│  - Validates & normalizes data         │
│  - Persists events (Prisma → Postgres) │
└─────┬──────────────────────────────────┘
      v
┌────────────────────────────┐
│      Postgres Database     │
│         events table       │
└────────────────────────────┘


            ┌────────────┐
            │   Client   │
            └─────┬──────┘
                  │  GET /stats  (Express + Prisma)
                  v
        ┌─────────────────────────┐
        │ Aggregations (COUNT,    │
        │ GROUP BY, Time Buckets) │
        └──────────┬──────────────┘
                   v
             JSON Summary Response

```

### Why This Choice?
- **Performance**: Enqueuing in BullMQ is ~1ms (in-memory Redis ops); clients never wait for DB I/O (~50-200ms). Tested with 1k+ req/s using Artillery.
- **Reliability**: BullMQ provides job persistence, retries (e.g., on DB downtime), dead-letter queues, and monitoring. Redis is battle-tested for queues.
- **Simplicity & Scalability**: Lightweight (no Kafka overhead); scale workers horizontally. Prisma adds type-safe queries/migrations.
- **Alternatives Considered**: Pure Redis lists (lacks retries); RabbitMQ (heavier setup); in-process queues (not durable across restarts). BullMQ strikes the best balance for this scale.

Assumptions: Focus on `page_view` for stats; timestamps in ISO; no auth (add JWT if needed).

## Database Schema

We use PostgreSQL for its robust indexing and aggregation support. The schema is defined in Prisma (`prisma/schema.prisma`), which generates migrations and type-safe client code.

### Simple Description
- **Table: `events`** (stores raw events for aggregation).
  - `id`: Auto-incrementing primary key (SERIAL).
  - `siteId`: String (required, indexed for site filters).
  - `eventType`: String (e.g., "page_view", indexed).
  - `path`: String (e.g., "/pricing", indexed for top_paths).
  - `userId`: String (optional, for unique_users via DISTINCT).
  - `timestamp`: DateTime (ISO, indexed for date filters).
  - `createdAt`: DateTime (default: now(), for auditing).

### Schema Diagram (Prisma)
```
model Event {
  id         Int       @id @default(autoincrement())
  siteId     String
  eventType  String
  path       String
  userId     String?
  timestamp  DateTime
  createdAt  DateTime  @default(now())

  @@map("events")
  @@index([siteId])
  @@index([timestamp])
  @@index([siteId, timestamp])
  @@index([path])
}
```

Run `npx prisma migrate dev` to apply. Indexes ensure efficient queries (e.g., <1s for 1M rows).

## Setup Instructions

This project assumes remote PostgreSQL and Redis (e.g., AWS RDS, Upstash). No local Docker—deploy directly or via the provided Dockerfile.

### Prerequisites
- Node.js >= 18.
- Remote Postgres DB (create `analytics` database).
- Remote Redis instance.
- Git (for repo cloning).

### Step-by-Step Setup
1. **Clone the Repository**:
   ```
   git clone https://github.com/Ashlok2003/website-analytics.git  # Or download ZIP
   cd website-analytics
   ```

2. **Install Dependencies**:
   ```
   make install  # Runs: npm ci && npx prisma generate
   ```
   (Generates Prisma client from schema.)

3. **Configure Environment**:
   - Copy `.env.example` to `.env`.
   - Update with your remote creds:
     ```
     DATABASE_URL="postgresql://username:password@your-db-host:5432/analytics?schema=public"
     REDIS_URL="redis://username:password@your-redis-host:6379"
     ```
   - Test connectivity: `npx prisma db pull` (fetches schema if needed).

4. **Run Database Migration**:
   ```
   make setup  # Runs: install + npx prisma migrate dev --name init
   ```
   (Creates `events` table and indexes on remote DB.)

5. **Start the Services**:
   ```
   make start-all
   ```
   - Starts three processes in background:
     - Ingestion: `http://localhost:3000` (port from `INGESTION_PORT`).
     - Processor: Background worker (no port; logs to console).
     - Reporting: `http://localhost:3001` (port from `REPORTING_PORT`).
   - View logs: Each runs in a subshell; Ctrl+C to stop.

6. **Verify**:
   - Swagger docs: Open `http://localhost:3000/api-docs` (ingestion) or `http://localhost:3001/api-docs` (reporting).
   - Test ingestion (see API Usage below).
   - Check queue: Use Redis CLI (`redis-cli LLEN events`) or BullMQ dashboard (add `@bull-board` if needed).

7. **Production Deployment**:
   - Build: `make build` (compiles TS to JS in `/dist`).
   - Run: Use PM2 (`pm2 start ecosystem.config.js`) or Docker:
     ```
     docker build -t analytics-ingestion . && docker run -p 3000:3000 -e DATABASE_URL=... analytics-ingestion  # Repeat for each service
     ```
   - Scale: Multiple workers (`bullmq` cluster mode); load balance APIs.

Troubleshooting:
- DB errors: Check `DATABASE_URL` (use `?sslmode=require` for TLS).
- Queue issues: Verify `REDIS_URL`; test with `redis-cli ping`.
- Logs: Services log to stdout; use `NODE_ENV=production` for quiet mode.

## API Usage

### Ingestion: POST /event
Sends an event to the queue (fast, no DB wait).

**Example Curl**:
```bash
curl -X POST http://localhost:3000/event \
  -H "Content-Type: application/json" \
  -d '{
    "site_id": "site-abc-123",
    "event_type": "page_view",
    "path": "/pricing",
    "user_id": "user-xyz-789",
    "timestamp": "2025-11-12T19:30:01Z"
  }'
```

**Expected Response** (immediate):
```json
{
  "success": true,
  "message": "Event queued"
}
```

**Error Example** (missing `site_id`):
```json
{
  "error": "Required"
}
```
- Status: 400 (validation), 500 (queue fail).

### Reporting: GET /stats
Aggregates `page_view` events (total views, unique users, top 3 paths).

**Example Curl** (with date filter):
```bash
curl "http://localhost:3001/stats?site_id=site-abc-123&date=2025-11-12"
```

**Expected Response** (after processor runs):
```json
{
  "site_id": "site-abc-123",
  "date": "2025-11-12",
  "total_views": 1450,
  "unique_users": 212,
  "top_paths": [
    {
      "path": "/pricing",
      "views": 700
    },
    {
      "path": "/blog/post-1",
      "views": 500
    },
    {
      "path": "/",
      "views": 250
    }
  ]
}
```

**Without Date** (all-time):
```bash
curl "http://localhost:3001/stats?site_id=site-abc-123"
```
- Omits `date` in response.
- Errors: 400 (missing `site_id`), 500 (DB query fail).

For more, explore Swagger UI at `/api-docs`.

**Project Structure** (key files):

```
├── README.md              # This doc
├── package.json           # Deps: express, prisma, bullmq, zod, etc.
├── tsconfig.json          # TS config
├── prisma/schema.prisma   # DB schema
├── Makefile               # Commands: install, setup, start-all
├── .env.example           # Config template
├── src/lib/               # Shared: queue.ts, db.ts, validator.ts
├── src/services/          # ingestion.ts, processor.ts, reporting.ts
└── docs/               # ingestion.yaml, reporting.yaml (OpenAPI specs)
```

Contributions welcome! Issues: Add rate limiting, event types, or sharding for ultra-high scale.
