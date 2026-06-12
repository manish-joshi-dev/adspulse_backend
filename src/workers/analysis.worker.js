import { Worker } from "bullmq";
import analysisQueue, { analysisQueueEvents } from "../config/queue.config.js";
import redis from "../config/redis.config.js";
import AnalysisJob from "../models/AnalysisJob.model.js";
import { parseGoogleAdsCSV } from "../services/csvParser.service.js";
import {
  computePerformanceScore,
  detectAnomalies,
  runDiagnostics
} from "../services/diagnostics.service.js";
import { generateRecommendations } from "../services/gemini.service.js";
import { deleteUploadedFile } from "../utils/fileCleanup.util.js";

const CONCURRENCY = 2;

let worker = null;

const round = (value, digits = 2) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(digits));
};

const safeDivide = (numerator, denominator) => {
  if (!denominator) return 0;
  return numerator / denominator;
};

const summarizeAccount = (parsedData, score) => {
  const totals = parsedData.rows.reduce(
    (accumulator, row) => {
      accumulator.totalCost += row.cost || 0;
      accumulator.totalConversions += row.conversions || 0;
      accumulator.totalConversionValue += row.conversionValue || 0;
      return accumulator;
    },
    {
      totalCost: 0,
      totalConversions: 0,
      totalConversionValue: 0
    }
  );

  return {
    campaignCount: parsedData.meta.campaignCount,
    dateRange: parsedData.meta.dateRangeLabel,
    totalCost: round(totals.totalCost, 2),
    totalConversions: round(totals.totalConversions, 2),
    accountROAS: round(safeDivide(totals.totalConversionValue, totals.totalCost), 2),
    score: round(score.totalScore, 0),
    scoreBand: score.scoreBand
  };
};

const updateMongoProgress = async (jobId, progress, updates = {}) => {
  const document = await AnalysisJob.findOneAndUpdate(
    { jobId },
    {
      $set: {
        progress,
        ...updates
      }
    },
    {
      new: true,
      runValidators: true
    }
  );

  if (!document) {
    throw new Error(`AnalysisJob document not found for jobId ${jobId}`);
  }

  return document;
};

const updateProgress = async (job, progress, updates = {}) => {
  await job.updateProgress(progress);
  return updateMongoProgress(job.data.jobId, progress, updates);
};

export const processAnalysisJob = async (job) => {
  const { jobId, filePath, fileName } = job.data;

  try {
    await updateProgress(job, 5, {
      status: "processing",
      errorMessage: undefined
    });

    const parsedData = await parseGoogleAdsCSV(filePath);
    await updateProgress(job, 25);

    const diagnostics = runDiagnostics(parsedData);
    await updateProgress(job, 50);

    const score = computePerformanceScore(parsedData.campaigns, diagnostics);
    await updateProgress(job, 60);

    const anomalies = detectAnomalies(parsedData);
    await updateProgress(job, 70);

    const aiRecommendations = await generateRecommendations(
      diagnostics,
      anomalies,
      summarizeAccount(parsedData, score),
      parsedData.dataQuality
    );
    await updateProgress(job, 85);

    await updateProgress(job, 95, {
      rowCount: parsedData.meta.rowCount,
      campaignCount: parsedData.meta.campaignCount,
      performanceScore: round(score.totalScore, 2),
      scoreBand: score.scoreBand,
      diagnostics,
      anomalies,
      aiRecommendations,
      scoreBreakdown: score.scoreBreakdown
    });

    await deleteUploadedFile(filePath);
    await updateProgress(job, 98);

    await updateProgress(job, 100, {
      status: "completed",
      processedAt: new Date(),
      errorMessage: undefined
    });

    return {
      jobId,
      fileName,
      status: "completed",
      rowCount: parsedData.meta.rowCount,
      campaignCount: parsedData.meta.campaignCount,
      performanceScore: round(score.totalScore, 2),
      scoreBand: score.scoreBand
    };
  } catch (error) {
    await job.updateProgress(100);
    await AnalysisJob.findOneAndUpdate(
      { jobId },
      {
        $set: {
          status: "failed",
          progress: 100,
          errorMessage: error.message,
          processedAt: new Date()
        }
      },
      { new: true }
    );
    await deleteUploadedFile(filePath);
    throw error;
  }
};

export const startAnalysisWorker = () => {
  if (worker) {
    return worker;
  }

  worker = new Worker("analysis-queue", processAnalysisJob, {
    connection: redis,
    concurrency: CONCURRENCY
  });

  worker.on("completed", (job) => {
    console.log("analysis-queue worker completed job", {
      jobId: job.id,
      appJobId: job.data?.jobId,
      fileName: job.data?.fileName
    });
  });

  worker.on("failed", (job, error) => {
    console.error("analysis-queue worker failed job", {
      jobId: job?.id,
      appJobId: job?.data?.jobId,
      fileName: job?.data?.fileName,
      message: error.message
    });
  });

  worker.on("progress", (job, progress) => {
    console.log("analysis-queue worker progress", {
      jobId: job.id,
      appJobId: job.data?.jobId,
      progress
    });
  });

  console.log(`analysis-queue BullMQ worker started with concurrency ${CONCURRENCY}`);
  return worker;
};

export const closeAnalysisWorker = async () => {
  if (worker) {
    await worker.close();
    worker = null;
  }
};

export { analysisQueue, analysisQueueEvents };
