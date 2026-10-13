-- CreateEnum
CREATE TYPE "ObservationType" AS ENUM ('SPAN', 'GENERATION', 'EVENT');

-- CreateEnum
CREATE TYPE "ObservationLevel" AS ENUM ('DEBUG', 'DEFAULT', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "ScoreDataType" AS ENUM ('NUMERIC', 'CATEGORICAL', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "ScoreSource" AS ENUM ('API', 'ANNOTATION', 'EVAL');

-- CreateEnum
CREATE TYPE "PromptType" AS ENUM ('TEXT', 'CHAT');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "hashedSecretKey" TEXT NOT NULL,
    "secretKeyPreview" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "IngestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "parentObservationId" TEXT,
    "type" "ObservationType" NOT NULL DEFAULT 'SPAN',
    "name" TEXT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "level" "ObservationLevel" NOT NULL DEFAULT 'DEFAULT',
    "statusMessage" TEXT,
    "input" JSONB,
    "output" JSONB,
    "metadata" JSONB,
    "model" TEXT,
    "modelParameters" JSONB,
    "providedUsageDetails" JSONB,
    "usageDetails" JSONB,
    "providedCostDetails" JSONB,
    "costDetails" JSONB,
    "totalCost" DECIMAL(12,6),
    "traceName" TEXT,
    "userId" TEXT,
    "sessionId" TEXT,
    "tags" TEXT[],
    "promptId" TEXT,
    "promptName" TEXT,
    "promptVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "observationId" TEXT,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "stringValue" TEXT,
    "dataType" "ScoreDataType" NOT NULL DEFAULT 'NUMERIC',
    "source" "ScoreSource" NOT NULL DEFAULT 'API',
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prompt" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "type" "PromptType" NOT NULL DEFAULT 'TEXT',
    "prompt" JSONB NOT NULL,
    "labels" TEXT[],
    "config" JSONB,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_publicKey_key" ON "ApiKey"("publicKey");

-- CreateIndex
CREATE INDEX "ApiKey_projectId_idx" ON "ApiKey"("projectId");

-- CreateIndex
CREATE INDEX "IngestEvent_processedAt_idx" ON "IngestEvent"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IngestEvent_projectId_eventId_key" ON "IngestEvent"("projectId", "eventId");

-- CreateIndex
CREATE INDEX "Observation_projectId_traceId_idx" ON "Observation"("projectId", "traceId");

-- CreateIndex
CREATE INDEX "Observation_projectId_sessionId_idx" ON "Observation"("projectId", "sessionId");

-- CreateIndex
CREATE INDEX "Observation_projectId_startTime_idx" ON "Observation"("projectId", "startTime");

-- CreateIndex
CREATE INDEX "Observation_projectId_parentObservationId_idx" ON "Observation"("projectId", "parentObservationId");

-- CreateIndex
CREATE UNIQUE INDEX "Observation_projectId_id_key" ON "Observation"("projectId", "id");

-- CreateIndex
CREATE INDEX "Score_projectId_traceId_idx" ON "Score"("projectId", "traceId");

-- CreateIndex
CREATE INDEX "Score_projectId_observationId_idx" ON "Score"("projectId", "observationId");

-- CreateIndex
CREATE INDEX "Prompt_projectId_name_idx" ON "Prompt"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Prompt_projectId_name_version_key" ON "Prompt"("projectId", "name", "version");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestEvent" ADD CONSTRAINT "IngestEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_projectId_observationId_fkey" FOREIGN KEY ("projectId", "observationId") REFERENCES "Observation"("projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prompt" ADD CONSTRAINT "Prompt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
