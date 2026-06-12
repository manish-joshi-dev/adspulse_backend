import { parseGoogleAdsCSV } from "./csvParser.service.js";
import {
  computePerformanceScore,
  detectAnomalies,
  runDiagnostics
} from "./diagnostics.service.js";
import { generateRecommendations } from "./gemini.service.js";
import { createReport } from "./report.service.js";

const round = (value, digits = 2) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(digits));
};

const safeDivide = (numerator, denominator) => {
  if (!denominator) {
    return 0;
  }
  return numerator / denominator;
};

const toPercent = (ratio) => round((ratio || 0) * 100);

const formatLabel = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const emptyMetrics = () => ({
  impressions: 0,
  clicks: 0,
  cost: 0,
  conversions: 0,
  conversionValue: 0
});

const addRowMetrics = (metrics, row) => {
  metrics.impressions += row.impressions || 0;
  metrics.clicks += row.clicks || 0;
  metrics.cost += row.cost || 0;
  metrics.conversions += row.conversions || 0;
  metrics.conversionValue += row.conversionValue || 0;
};

const finalizeMetrics = (metrics) => ({
  impressions: Math.round(metrics.impressions),
  clicks: Math.round(metrics.clicks),
  cost: round(metrics.cost),
  conversions: round(metrics.conversions),
  ctr: toPercent(safeDivide(metrics.clicks, metrics.impressions)),
  cpc: round(safeDivide(metrics.cost, metrics.clicks)),
  conversionRate: toPercent(safeDivide(metrics.conversions, metrics.clicks)),
  cpa: round(safeDivide(metrics.cost, metrics.conversions))
});

const buildTotals = (rows) => {
  const totals = emptyMetrics();
  rows.forEach((row) => addRowMetrics(totals, row));
  return finalizeMetrics(totals);
};

const buildAccountROAS = (rows) => {
  const totals = emptyMetrics();
  rows.forEach((row) => addRowMetrics(totals, row));
  return round(safeDivide(totals.conversionValue, totals.cost), 2);
};

const buildDailyTrend = (rows) => {
  const grouped = new Map();

  rows
    .filter((row) => row.date)
    .forEach((row) => {
      if (!grouped.has(row.date)) {
        grouped.set(row.date, emptyMetrics());
      }
      addRowMetrics(grouped.get(row.date), row);
    });

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, metrics]) => ({
      date,
      ...finalizeMetrics(metrics)
    }));
};

const adaptCampaigns = (campaigns) =>
  [...campaigns.values()]
    .map((campaign) => ({
      campaign: campaign.name,
      status: "Enabled",
      impressions: campaign.totalImpressions,
      clicks: campaign.totalClicks,
      cost: campaign.totalCost,
      conversions: campaign.totalConversions,
      ctr: toPercent(campaign.avgCTR),
      cpc: campaign.avgCPC,
      conversionRate: toPercent(campaign.avgConversionRate),
      cpa: round(safeDivide(campaign.totalCost, campaign.totalConversions)),
      roas: campaign.ROAS,
      qualityScore: campaign.avgQualityScore,
      impressionShare: campaign.avgImpressionShare,
      lostISBudget: campaign.avgLostISBudget,
      lostISRank: campaign.avgLostISRank,
      score: Math.round(
        Math.min(
          100,
          toPercent(campaign.avgCTR / 0.0191) * 0.25 +
            Math.min(campaign.ROAS / 4, 1) * 25 +
            toPercent(campaign.avgConversionRate / 0.0329) * 0.25 +
            Math.min((campaign.avgImpressionShare || 0) / 0.7, 1) * 25
        )
      )
    }))
    .sort((a, b) => b.cost - a.cost);

const adaptDiagnosticsToChecks = (diagnostics, dataQuality) => {
  const diagnosticChecks = diagnostics.map((flag) => ({
    code: flag.flagType,
    label: formatLabel(flag.flagType),
    status: flag.severity === "critical" ? "fail" : flag.severity === "warning" ? "warn" : "pass",
    severity: flag.severity === "critical" ? "high" : flag.severity === "warning" ? "medium" : "low",
    message: flag.description,
    campaigns: flag.entityType === "campaign" ? [flag.affectedEntity] : [],
    affectedEntity: flag.affectedEntity,
    entityType: flag.entityType,
    metricName: flag.metricName,
    actualValue: flag.actualValue,
    benchmarkValue: flag.benchmarkValue,
    delta: flag.delta
  }));

  const qualityChecks = (dataQuality?.warningMessages || []).map((message) => ({
    code: "DATA_QUALITY",
    label: "Data Quality",
    status: "warn",
    severity: "medium",
    message,
    campaigns: []
  }));

  if (diagnosticChecks.length === 0 && qualityChecks.length === 0) {
    return [
      {
        code: "ACCOUNT_HEALTH",
        label: "Account health",
        status: "pass",
        severity: "low",
        message: "No material diagnostic flags were detected.",
        campaigns: []
      }
    ];
  }

  return [...diagnosticChecks, ...qualityChecks];
};

const adaptAnomalies = (anomalies) =>
  anomalies.map((anomaly) => ({
    ...anomaly,
    entity: anomaly.affectedEntity,
    metric: anomaly.metricName,
    label: `${formatLabel(anomaly.metricName)} ${anomaly.direction === "increase" ? "increased" : "decreased"}`,
    previous: anomaly.previousValue,
    current: anomaly.currentValue,
    direction: anomaly.direction === "increase" ? "up" : "down",
    severity: Math.abs(anomaly.changePercent) >= 40 || Math.abs(anomaly.zScore) >= 2.5 ? "high" : "medium"
  }));

const toGeminiAnomalies = (anomalies) =>
  anomalies.map((anomaly) => ({
    affectedEntity: anomaly.affectedEntity || anomaly.entity,
    metricName: anomaly.metricName || anomaly.metric,
    changePercent: anomaly.changePercent,
    direction:
      anomaly.direction === "up"
        ? "increase"
        : anomaly.direction === "down"
          ? "decrease"
          : anomaly.direction
  }));

const buildCampaignSummary = (parsedData, analysis) => ({
  campaignCount: parsedData.meta.campaignCount,
  dateRange: parsedData.meta.dateRangeLabel,
  totalCost: analysis.totals.cost,
  totalConversions: analysis.totals.conversions,
  accountROAS: buildAccountROAS(parsedData.rows),
  score: analysis.performanceScore,
  scoreBand: analysis.grade,
  topCampaigns: analysis.campaigns.slice(0, 8)
});

const buildAnalysis = (parsedData) => {
  const diagnostics = runDiagnostics(parsedData);
  const score = computePerformanceScore(parsedData.campaigns, diagnostics);
  const anomalies = detectAnomalies(parsedData);
  const checks = adaptDiagnosticsToChecks(diagnostics, parsedData.dataQuality);

  return {
    performanceScore: Math.round(score.totalScore),
    grade: score.scoreBand,
    totals: buildTotals(parsedData.rows),
    campaigns: adaptCampaigns(parsedData.campaigns),
    dailyTrend: buildDailyTrend(parsedData.rows),
    checks,
    anomalies: adaptAnomalies(anomalies),
    diagnostics,
    scoreBreakdown: score.scoreBreakdown,
    dataQuality: parsedData.dataQuality,
    parsedMeta: parsedData.meta
  };
};

export const analyzeUploadedCsv = async ({ filePath, originalName, userId = null }) => {
  const parsedData = await parseGoogleAdsCSV(filePath);
  const analysis = buildAnalysis(parsedData);
  const recommendations = await generateRecommendations(
    analysis.diagnostics,
    toGeminiAnomalies(analysis.anomalies),
    buildCampaignSummary(parsedData, analysis),
    analysis.dataQuality
  );

  return createReport({
    uploadedBy: userId || null,
    sourceFile: originalName || "google-ads-export.csv",
    rowCount: parsedData.meta.rowCount,
    ...analysis,
    recommendations
  });
};
