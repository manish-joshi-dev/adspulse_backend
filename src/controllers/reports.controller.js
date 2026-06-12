import { validationResult } from "express-validator";
import { v4 as uuidv4 } from "uuid";
import AnalysisJob from "../models/AnalysisJob.model.js";
import Report from "../models/Report.model.js";

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

  return failure(res, 400, "VALIDATION_ERROR", "Invalid request input.", errors.array());
};

const isOwner = (document, userId) => {
  return String(document.userId) === String(userId);
};

const buildReportSummary = (analysisJob) => {
  const scoreText =
    typeof analysisJob.performanceScore === "number"
      ? `${analysisJob.performanceScore}/100 (${analysisJob.scoreBand || "Unrated"})`
      : "not scored";
  const diagnostics = analysisJob.diagnostics || [];
  const anomalies = analysisJob.anomalies || [];
  const recommendations = analysisJob.aiRecommendations || [];
  const criticalCount = diagnostics.filter((flag) => flag.severity === "critical").length;
  const warningCount = diagnostics.filter((flag) => flag.severity === "warning").length;
  const topIssues = diagnostics
    .slice(0, 3)
    .map((flag) => `${flag.affectedEntity || "An entity"}: ${flag.description}`)
    .join(" ");

  const issueSummary = topIssues || "No major diagnostic issues were detected in the uploaded data.";

  return `The ${analysisJob.fileName} analysis reviewed ${analysisJob.campaignCount || 0} campaigns and produced a performance score of ${scoreText}. The diagnostic engine found ${diagnostics.length} flags, including ${criticalCount} critical issues and ${warningCount} warnings, plus ${anomalies.length} week-over-week anomalies. ${issueSummary} The recommendation set includes ${recommendations.length} prioritized actions for campaign optimization.`;
};

const buildShareUrl = (req, report) => {
  const baseUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get("host")}`;
  return `${baseUrl.replace(/\/$/, "")}/report/${report._id}?shareToken=${report.shareToken}`;
};

export const generateReport = async (req, res) => {
  const validationResponse = validationFailure(req, res);
  if (validationResponse) return validationResponse;

  try {
    const analysisJob = await AnalysisJob.findOne({
      jobId: req.body.jobId,
      userId: req.user.userId
    });

    if (!analysisJob) {
      return failure(res, 404, "ANALYSIS_NOT_FOUND", "Completed analysis job was not found.");
    }

    if (analysisJob.status !== "completed") {
      return failure(res, 409, "ANALYSIS_NOT_COMPLETE", "Reports can only be generated from completed analyses.", {
        status: analysisJob.status,
        progress: analysisJob.progress
      });
    }

    const report = await Report.create({
      userId: req.user.userId,
      analysisJobId: analysisJob._id,
      title: req.body.title || `${analysisJob.fileName} diagnostic report`,
      summary: buildReportSummary(analysisJob)
    });

    return success(
      res,
      {
        report
      },
      201
    );
  } catch (error) {
    return failure(res, 500, "REPORT_GENERATION_FAILED", "Unable to generate report.", error.message);
  }
};

export const getReport = async (req, res) => {
  const validationResponse = validationFailure(req, res);
  if (validationResponse) return validationResponse;

  try {
    const report = await Report.findById(req.params.reportId)
      .populate("analysisJobId")
      .lean();

    if (!report) {
      return failure(res, 404, "REPORT_NOT_FOUND", "Report was not found.");
    }

    const requesterId = req.user?.userId;

    if (!report.isPublic && (!requesterId || !isOwner(report, requesterId))) {
      return failure(res, 403, "FORBIDDEN", "You do not have access to this report.");
    }

    return success(res, {
      report
    });
  } catch (error) {
    return failure(res, 500, "REPORT_FETCH_FAILED", "Unable to fetch report.", error.message);
  }
};

export const shareReport = async (req, res) => {
  const validationResponse = validationFailure(req, res);
  if (validationResponse) return validationResponse;

  try {
    const report = await Report.findById(req.params.reportId);

    if (!report) {
      return failure(res, 404, "REPORT_NOT_FOUND", "Report was not found.");
    }

    if (!isOwner(report, req.user.userId)) {
      return failure(res, 403, "FORBIDDEN", "You do not have access to this report.");
    }

    report.isPublic = true;
    report.shareToken = report.shareToken || uuidv4();
    await report.save();

    return success(res, {
      reportId: report._id,
      isPublic: report.isPublic,
      shareToken: report.shareToken,
      shareUrl: buildShareUrl(req, report)
    });
  } catch (error) {
    return failure(res, 500, "REPORT_SHARE_FAILED", "Unable to share report.", error.message);
  }
};
