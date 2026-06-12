import { validationResult } from "express-validator";
import AnalysisJob from "../models/AnalysisJob.model.js";
import { analysisQueue } from "../config/queue.config.js";

const success = (res, data, statusCode = 200) => {
  return res.status(statusCode).json({ success: true, data });
};

const failure = (res, statusCode, code, message, details = null) => {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details
    }
  });
};

const validationFailure = (req, res) => {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return null;
  }

  return failure(res, 400, "VALIDATION_ERROR", "Invalid request parameters.", errors.array());
};

const isOwner = (analysisJob, userId) => {
  return String(analysisJob.userId) === String(userId);
};

const getBullQueueDetails = async (jobId) => {
  const bullJob = await analysisQueue.getJob(jobId);

  if (!bullJob) {
    return {
      state: null,
      position: null
    };
  }

  const state = await bullJob.getState();
  let position = null;

  if (state === "waiting" || state === "delayed") {
    const queuedJobs = await analysisQueue.getJobs([state], 0, 1000);
    const queueIndex = queuedJobs.findIndex((queuedJob) => String(queuedJob.id) === String(jobId));
    position = queueIndex >= 0 ? queueIndex + 1 : null;
  }

  return {
    state,
    position
  };
};

export const getAnalysisStatus = async (req, res) => {
  const validationResponse = validationFailure(req, res);
  if (validationResponse) return validationResponse;

  try {
    const analysisJob = await AnalysisJob.findOne({ jobId: req.params.jobId });

    if (!analysisJob) {
      return failure(res, 404, "ANALYSIS_NOT_FOUND", "Analysis job was not found.");
    }

    if (!isOwner(analysisJob, req.user.userId)) {
      return failure(res, 403, "FORBIDDEN", "You do not have access to this analysis job.");
    }

    const queue = await getBullQueueDetails(req.params.jobId);

    return success(res, {
      jobId: analysisJob.jobId,
      status: analysisJob.status,
      progress: analysisJob.progress,
      errorMessage: analysisJob.errorMessage || null,
      queue
    });
  } catch (error) {
    return failure(res, 500, "ANALYSIS_STATUS_FAILED", "Unable to fetch analysis status.", error.message);
  }
};

export const getAnalysisResults = async (req, res) => {
  const validationResponse = validationFailure(req, res);
  if (validationResponse) return validationResponse;

  try {
    const analysisJob = await AnalysisJob.findOne({ jobId: req.params.jobId });

    if (!analysisJob) {
      return failure(res, 404, "ANALYSIS_NOT_FOUND", "Analysis job was not found.");
    }

    if (!isOwner(analysisJob, req.user.userId)) {
      return failure(res, 403, "FORBIDDEN", "You do not have access to this analysis job.");
    }

    if (analysisJob.status !== "completed") {
      return success(
        res,
        {
          jobId: analysisJob.jobId,
          status: analysisJob.status,
          progress: analysisJob.progress,
          errorMessage: analysisJob.errorMessage || null
        },
        202
      );
    }

    return success(res, {
      analysisJob
    });
  } catch (error) {
    return failure(res, 500, "ANALYSIS_RESULTS_FAILED", "Unable to fetch analysis results.", error.message);
  }
};

export const getAnalysisHistory = async (req, res) => {
  try {
    const analyses = await AnalysisJob.find({
      userId: req.user.userId,
      status: { $ne: "archived" }
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .select("jobId fileName status performanceScore scoreBand campaignCount createdAt processedAt")
      .lean();

    return success(res, {
      analyses
    });
  } catch (error) {
    return failure(res, 500, "ANALYSIS_HISTORY_FAILED", "Unable to fetch analysis history.", error.message);
  }
};

export const archiveAnalysis = async (req, res) => {
  const validationResponse = validationFailure(req, res);
  if (validationResponse) return validationResponse;

  try {
    const analysisJob = await AnalysisJob.findOne({ jobId: req.params.jobId });

    if (!analysisJob) {
      return failure(res, 404, "ANALYSIS_NOT_FOUND", "Analysis job was not found.");
    }

    if (!isOwner(analysisJob, req.user.userId)) {
      return failure(res, 403, "FORBIDDEN", "You do not have access to this analysis job.");
    }

    analysisJob.status = "archived";
    await analysisJob.save();

    try {
      const bullJob = await analysisQueue.getJob(req.params.jobId);
      if (bullJob) {
        await bullJob.remove();
      }
    } catch (queueError) {
      console.warn("Analysis archived in MongoDB, but BullMQ job removal failed", {
        jobId: req.params.jobId,
        message: queueError.message
      });
    }

    return success(res, {
      jobId: analysisJob.jobId,
      status: analysisJob.status
    });
  } catch (error) {
    return failure(res, 500, "ANALYSIS_ARCHIVE_FAILED", "Unable to archive analysis job.", error.message);
  }
};
