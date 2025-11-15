-- CreateTable
CREATE TABLE "events" (
    "id" SERIAL NOT NULL,
    "siteId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "userId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_siteId_idx" ON "events"("siteId");

-- CreateIndex
CREATE INDEX "events_timestamp_idx" ON "events"("timestamp");

-- CreateIndex
CREATE INDEX "events_siteId_timestamp_idx" ON "events"("siteId", "timestamp");

-- CreateIndex
CREATE INDEX "events_path_idx" ON "events"("path");
