import path from "path";
import { fileURLToPath } from "url";
import app from "./app.js";
import { config } from "./src/config/env.js";
import { connectDatabase, disconnectDatabase } from "./src/config/database.js";
import {
  analysisQueue,
  analysisQueueEvents,
  closeAnalysisWorker,
  startAnalysisWorker
} from "./src/workers/analysis.worker.js";
import {
  disconnectRedisClient,
  verifyRedisConnection
} from "./src/config/redis.config.js";
import { cleanupOldFiles } from "./src/utils/fileCleanup.util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, "uploads");

const startServer = async () => {
  const database = await connectDatabase();
  const redis = await verifyRedisConnection();
  await cleanupOldFiles(uploadsDir, 24);
  startAnalysisWorker();

  app.locals.database = database;
  app.locals.redis = redis;
  app.locals.analysisQueue = analysisQueue;

  const server = app.listen(config.port, () => {
    console.log(`AdsPulse API listening on port ${config.port}`);
  });

  const shutdown = async (signal) => {
    console.log(`${signal} received. Closing AdsPulse API.`);
    server.close(async () => {
      if (analysisQueue) {
        await closeAnalysisWorker();
        await analysisQueue.close();
        await analysisQueueEvents.close();
      }
      await disconnectRedisClient();
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

startServer().catch((error) => {
  console.error("Failed to start AdsPulse API", error);
  process.exit(1);
});
