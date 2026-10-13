-- CreateTable
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scorers" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "expectedOutput" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetRunItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "datasetRunId" TEXT NOT NULL,
    "datasetItemId" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "observationId" TEXT,
    "inputSnapshot" JSONB NOT NULL,
    "expectedOutputSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dataset_projectId_name_key" ON "Dataset"("projectId", "name");

-- CreateIndex
CREATE INDEX "DatasetItem_projectId_datasetId_idx" ON "DatasetItem"("projectId", "datasetId");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetRun_projectId_datasetId_name_key" ON "DatasetRun"("projectId", "datasetId", "name");

-- CreateIndex
CREATE INDEX "DatasetRunItem_projectId_datasetRunId_idx" ON "DatasetRunItem"("projectId", "datasetRunId");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetRunItem_datasetRunId_datasetItemId_key" ON "DatasetRunItem"("datasetRunId", "datasetItemId");

-- AddForeignKey
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetItem" ADD CONSTRAINT "DatasetItem_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetRun" ADD CONSTRAINT "DatasetRun_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetRunItem" ADD CONSTRAINT "DatasetRunItem_datasetRunId_fkey" FOREIGN KEY ("datasetRunId") REFERENCES "DatasetRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetRunItem" ADD CONSTRAINT "DatasetRunItem_datasetItemId_fkey" FOREIGN KEY ("datasetItemId") REFERENCES "DatasetItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
