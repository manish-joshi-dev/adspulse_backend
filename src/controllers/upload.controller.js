import { validationResult } from "express-validator";
import { v4 as uuidv4 } from "uuid";
import { isDatabaseConnected } from "../config/database.js";
import AnalysisJob from "../models/AnalysisJob.model.js";
import { deleteUploadedFile } from "../utils/fileCleanup.util.js";

const success = (res, data, status = 200) =>
  res.status(status).json({
    success: true,
    data
  });

const failure = (res, status, code, message, details = null) =>
  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      details
    }
  });

const validationFailure = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  failure(res, 400, "VALIDATION_ERROR", "Invalid request input.", errors.array());
  return true;
};

export const uploadCsv = async (req, res) => {
  try {
    if (validationFailure(req, res)) return;

    if (!req.file) {
      failure(res, 400, "CSV_FILE_REQUIRED", "CSV file is required");
      return;
    }

    if (!isDatabaseConnected()) {
      await deleteUploadedFile(req.file.path);
      failure(res, 503, "DATABASE_REQUIRED", "MongoDB is required to queue analysis jobs");
      return;
    }

    const queue = req.app.locals.analysisQueue;
    if (!queue) {
      await deleteUploadedFile(req.file.path);
      failure(
        res,
        503,
        "QUEUE_UNAVAILABLE",
        "Analysis queue is unavailable. Check REDIS_URL and worker startup."
      );
      return;
    }

    const jobId = uuidv4();
    const userId = req.user.userId;
    const fileName = req.file.originalname;
    const filePath = req.file.path;

    await AnalysisJob.create({
      jobId,
      userId,
      fileName,
      fileSize: req.file.size,
      status: "queued",
      progress: 0
    });

    await queue.add(
      "process-analysis",
      {
        jobId,
        filePath,
        userId,
        fileName
      },
      { jobId }
    );

    success(
      res,
      {
        jobId,
        message: "Analysis queued successfully",
        estimatedTime: "30-60 seconds"
      },
      202
    );
  } catch (error) {
    if (req.file?.path) {
      await deleteUploadedFile(req.file.path);
    }
    failure(res, 500, "UPLOAD_FAILED", "Unable to queue CSV analysis", error.message);
  }
};
