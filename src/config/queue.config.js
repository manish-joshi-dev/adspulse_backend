import { Queue, QueueEvents } from "bullmq";
import redis from "./redis.config.js";

export const analysisQueue = new Queue("analysis-queue", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000
    },
    removeOnComplete: {
      count: 50
    },
    removeOnFail: {
      count: 100
    }
  }
});

export const analysisQueueEvents = new QueueEvents("analysis-queue", {
  connection: redis
});

analysisQueue.on("error", (error) => {
  console.error("analysis-queue error", {
    message: error.message,
    stack: error.stack
  });
});

analysisQueueEvents.on("failed", ({ jobId, failedReason, prev }) => {
  console.error("analysis-queue job failed", {
    jobId,
    failedReason,
    previousState: prev
  });
});

analysisQueueEvents.on("stalled", ({ jobId, prev }) => {
  console.warn("analysis-queue job stalled", {
    jobId,
    previousState: prev
  });
});

analysisQueueEvents.on("error", (error) => {
  console.error("analysis-queue events error", {
    message: error.message,
    stack: error.stack
  });
});

export default analysisQueue;

