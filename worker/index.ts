import { Worker } from "bullmq";
import { INGESTION_QUEUE_NAME, getRedisConnection } from "../src/server/queue";
import { processIngestEvent } from "./processors/ingestion";

const worker = new Worker(
  INGESTION_QUEUE_NAME,
  async (job) => {
    await processIngestEvent(job.data.stagingId);
  },
  {
    connection: getRedisConnection(),
    concurrency: 10,
  },
);

worker.on("completed", (job) => {
  console.log(`[ingestion] processed ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`[ingestion] failed ${job?.id}:`, err.message);
});

console.log("Spanrail worker started, listening on queue:", INGESTION_QUEUE_NAME);

process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});
