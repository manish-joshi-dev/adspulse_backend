import { v4 as uuidv4 } from "uuid";
import { isDatabaseConnected } from "../config/database.js";
import { Report } from "../models/Report.js";
import { ApiError } from "../utils/http.js";

const memoryReports = [];

export const serializeReport = (report) => {
  const source = typeof report?.toObject === "function" ? report.toObject() : report;
  if (!source) {
    return null;
  }

  const id = String(source._id || source.id);
  return {
    ...source,
    _id: id,
    id,
    uploadedBy: source.uploadedBy ? String(source.uploadedBy) : null
  };
};

export const createReport = async (reportData) => {
  if (isDatabaseConnected()) {
    const report = await Report.create(reportData);
    return serializeReport(report);
  }

  const now = new Date().toISOString();
  const report = {
    ...reportData,
    _id: uuidv4(),
    createdAt: now,
    updatedAt: now
  };
  memoryReports.unshift(report);
  return serializeReport(report);
};

export const listReports = async ({ userId = null, limit = 20 } = {}) => {
  const parsedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  if (isDatabaseConnected()) {
    const query = userId ? { uploadedBy: userId } : {};
    const reports = await Report.find(query).sort({ createdAt: -1 }).limit(parsedLimit);
    return reports.map(serializeReport);
  }

  return memoryReports
    .filter((report) => !userId || report.uploadedBy === userId)
    .slice(0, parsedLimit)
    .map(serializeReport);
};

export const getReportById = async (id, userId = null) => {
  const report = isDatabaseConnected()
    ? await Report.findById(id)
    : memoryReports.find((item) => item._id === id || item.id === id);

  const serialized = serializeReport(report);
  if (!serialized || (userId && serialized.uploadedBy !== userId)) {
    throw new ApiError(404, "Report was not found");
  }

  return serialized;
};

export const deleteReportById = async (id, userId = null) => {
  const report = await getReportById(id, userId);

  if (isDatabaseConnected()) {
    await Report.findByIdAndDelete(id);
    return report;
  }

  const index = memoryReports.findIndex((item) => item._id === id || item.id === id);
  if (index >= 0) {
    memoryReports.splice(index, 1);
  }
  return report;
};

export const summarizeReports = async ({ userId = null } = {}) => {
  const reports = await listReports({ userId, limit: 100 });
  const count = reports.length;
  const averageScore =
    count === 0
      ? 0
      : Math.round(reports.reduce((sum, report) => sum + report.performanceScore, 0) / count);
  const totalSpend = reports.reduce((sum, report) => sum + (report.totals?.cost || 0), 0);

  return {
    count,
    averageScore,
    totalSpend,
    latestReport: reports[0] || null
  };
};

