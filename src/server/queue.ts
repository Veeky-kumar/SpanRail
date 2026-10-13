import { Queue } from "bullmq";
import IORedis from "ioredis";

let connection: IORedis | undefined;

function getConnection(): IORedis {
  if (!connection) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL environment variable is not set");
    connection = new IORedis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}

export const INGESTION_QUEUE_NAME = "ingestion";

export interface IngestionJobData {
  stagingId: string;
}

let ingestionQueue: Queue<IngestionJobData> | undefined;

export function getIngestionQueue(): Queue<IngestionJobData> {
  if (!ingestionQueue) {
    ingestionQueue = new Queue<IngestionJobData>(INGESTION_QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return ingestionQueue;
}

export { getConnection as getRedisConnection };
