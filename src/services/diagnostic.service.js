import { addDays, compareAsc, isWithinInterval, parseISO, subDays } from "date-fns";

const clamp = (value, min = 0, max = 100) => Math.min(Math.max(value, min), max);

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

const emptyMetrics = () => ({
  impressions: 0,
  clicks: 0,
  cost: 0,
  conversions: 0
});

const addRow = (metrics, row) => {
  metrics.impressions += row.impressions;
  metrics.clicks += row.clicks;
  metrics.cost += row.cost;
  metrics.conversions += row.conversions;
};

const finalizeMetrics = (metrics) => ({
  impressions: Math.round(metrics.impressions),
  clicks: Math.round(metrics.clicks),
  cost: round(metrics.cost),
  conversions: round(metrics.conversions),
  ctr: round(safeDivide(metrics.clicks, metrics.impressions) * 100),
  cpc: round(safeDivide(metrics.cost, metrics.clicks)),
  conversionRate: round(safeDivide(metrics.conversions, metrics.clicks) * 100),
  cpa: round(safeDivide(metrics.cost, metrics.conversions))
});

const median = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return 0;
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const gradeFromScore = (score) => {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
};

const calculateScore = (metrics, campaigns) => {
  const cpaValues = campaigns
    .filter((campaign) => campaign.conversions > 0)
    .map((campaign) => campaign.cpa);
  const medianCpa = median(cpaValues) || metrics.cpa || 75;
  const zeroConversionSpend = campaigns
    .filter((campaign) => campaign.conversions === 0)
    .reduce((sum, campaign) => sum + campaign.cost, 0);

  const ctrScore = clamp((metrics.ctr / 4) * 100);
  const conversionScore = clamp((metrics.conversionRate / 7) * 100);
  const cpaScore =
    metrics.conversions > 0
      ? clamp((medianCpa / Math.max(metrics.cpa, 0.01)) * 90)
      : metrics.cost > 100
        ? 8
        : 45;
  const wasteScore = metrics.cost > 0 ? clamp((1 - zeroConversionSpend / metrics.cost) * 100) : 50;
  const volumeScore = clamp(Math.sqrt(metrics.clicks / 500) * 100);

  return Math.round(
    ctrScore * 0.2 +
      conversionScore * 0.25 +
      cpaScore * 0.2 +
      wasteScore * 0.2 +
      volumeScore * 0.15
  );
};

const summarizeRows = (rows) => {
  const metrics = emptyMetrics();
  rows.forEach((row) => addRow(metrics, row));
  return finalizeMetrics(metrics);
};

const campaignSummaries = (rows) => {
  const grouped = new Map();

  rows.forEach((row) => {
    if (!grouped.has(row.campaign)) {
      grouped.set(row.campaign, {
        campaign: row.campaign,
        status: row.status,
        metrics: emptyMetrics()
      });
    }
    addRow(grouped.get(row.campaign).metrics, row);
  });

  const campaigns = [...grouped.values()].map((entry) => ({
    campaign: entry.campaign,
    status: entry.status,
    ...finalizeMetrics(entry.metrics)
  }));

  const medianCpa = median(
    campaigns.filter((campaign) => campaign.conversions > 0).map((campaign) => campaign.cpa)
  );

  return campaigns
    .map((campaign) => ({
      ...campaign,
      score: calculateScore(campaign, [
        {
          ...campaign,
          cpa: campaign.cpa || medianCpa
        }
      ])
    }))
    .sort((a, b) => b.cost - a.cost);
};

const buildDailyTrend = (rows) => {
  const grouped = new Map();

  rows
    .filter((row) => row.date)
    .forEach((row) => {
      if (!grouped.has(row.date)) {
        grouped.set(row.date, emptyMetrics());
      }
      addRow(grouped.get(row.date), row);
    });

  return [...grouped.entries()]
    .sort(([a], [b]) => compareAsc(parseISO(a), parseISO(b)))
    .map(([date, metrics]) => ({
      date,
      ...finalizeMetrics(metrics)
    }));
};

const periodRows = (rows, start, end) =>
  rows.filter((row) => {
    if (!row.date) {
      return false;
    }
    const date = parseISO(row.date);
    return isWithinInterval(date, { start, end });
  });

const compareMetric = ({ anomalies, entity, metric, label, previous, current, direction, threshold }) => {
  if (previous <= 0) {
    return;
  }

  const changePercent = ((current - previous) / previous) * 100;
  const isDrop = direction === "down" && changePercent <= -threshold;
  const isSpike = direction === "up" && changePercent >= threshold;

  if (!isDrop && !isSpike) {
    return;
  }

  anomalies.push({
    entity,
    metric,
    label,
    previous: round(previous),
    current: round(current),
    changePercent: round(changePercent),
    direction: changePercent > 0 ? "up" : "down",
    severity: Math.abs(changePercent) >= threshold * 2 ? "high" : "medium"
  });
};

const detectAnomaliesForRows = (rows, entity) => {
  const datedRows = rows.filter((row) => row.date);
  if (datedRows.length === 0) {
    return [];
  }

  const dates = datedRows.map((row) => parseISO(row.date)).sort(compareAsc);
  const latestDate = dates[dates.length - 1];
  const currentStart = subDays(latestDate, 6);
  const previousStart = subDays(latestDate, 13);
  const previousEnd = subDays(currentStart, 1);

  const previous = summarizeRows(periodRows(datedRows, previousStart, previousEnd));
  const current = summarizeRows(periodRows(datedRows, currentStart, addDays(latestDate, 1)));
  const anomalies = [];

  compareMetric({
    anomalies,
    entity,
    metric: "clicks",
    label: "Clicks dropped week over week",
    previous: previous.clicks,
    current: current.clicks,
    direction: "down",
    threshold: 25
  });
  compareMetric({
    anomalies,
    entity,
    metric: "conversions",
    label: "Conversions dropped week over week",
    previous: previous.conversions,
    current: current.conversions,
    direction: "down",
    threshold: 25
  });
  compareMetric({
    anomalies,
    entity,
    metric: "cost",
    label: "Spend increased week over week",
    previous: previous.cost,
    current: current.cost,
    direction: "up",
    threshold: 30
  });
  compareMetric({
    anomalies,
    entity,
    metric: "cpa",
    label: "Cost per conversion increased week over week",
    previous: previous.cpa,
    current: current.cpa,
    direction: "up",
    threshold: 30
  });
  compareMetric({
    anomalies,
    entity,
    metric: "ctr",
    label: "CTR dropped week over week",
    previous: previous.ctr,
    current: current.ctr,
    direction: "down",
    threshold: 20
  });

  return anomalies;
};

const detectAnomalies = (rows, campaigns) => {
  const accountAnomalies = detectAnomaliesForRows(rows, "Account");
  const campaignAnomalies = campaigns
    .slice(0, 8)
    .flatMap((campaign) =>
      detectAnomaliesForRows(
        rows.filter((row) => row.campaign === campaign.campaign),
        campaign.campaign
      )
    );

  return [...accountAnomalies, ...campaignAnomalies]
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 12);
};

const buildChecks = ({ totals, campaigns, anomalies, score }) => {
  const checks = [];
  const medianCpa = median(
    campaigns.filter((campaign) => campaign.conversions > 0).map((campaign) => campaign.cpa)
  );
  const zeroConversionCampaigns = campaigns.filter(
    (campaign) => campaign.cost >= Math.max(100, totals.cost * 0.08) && campaign.conversions === 0
  );
  const lowCtrCampaigns = campaigns.filter(
    (campaign) => campaign.impressions >= 500 && campaign.ctr < 1.5
  );
  const highCpaCampaigns = campaigns.filter(
    (campaign) => medianCpa > 0 && campaign.conversions > 0 && campaign.cpa > medianCpa * 1.5
  );
  const topCampaign = campaigns[0];

  checks.push({
    code: "ACCOUNT_SCORE",
    label: "Composite performance score",
    status: score >= 70 ? "pass" : score >= 50 ? "warn" : "fail",
    severity: score >= 70 ? "low" : score >= 50 ? "medium" : "high",
    message:
      score >= 70
        ? "The account has healthy aggregate efficiency signals."
        : "The account needs optimization across efficiency, conversion, or volume signals."
  });

  checks.push({
    code: "CTR_HEALTH",
    label: "Click-through rate",
    status: totals.ctr >= 2 ? "pass" : totals.ctr >= 1 ? "warn" : "fail",
    severity: totals.ctr >= 2 ? "low" : totals.ctr >= 1 ? "medium" : "high",
    message: `${lowCtrCampaigns.length} campaign(s) are below the 1.5% CTR watch threshold.`,
    campaigns: lowCtrCampaigns.slice(0, 5).map((campaign) => campaign.campaign)
  });

  checks.push({
    code: "CONVERSION_HEALTH",
    label: "Conversion rate",
    status: totals.conversionRate >= 3 ? "pass" : totals.conversionRate >= 1 ? "warn" : "fail",
    severity: totals.conversionRate >= 3 ? "low" : totals.conversionRate >= 1 ? "medium" : "high",
    message: `Account conversion rate is ${totals.conversionRate}%.`
  });

  checks.push({
    code: "WASTED_SPEND",
    label: "Spend without conversions",
    status: zeroConversionCampaigns.length === 0 ? "pass" : zeroConversionCampaigns.length <= 2 ? "warn" : "fail",
    severity: zeroConversionCampaigns.length === 0 ? "low" : zeroConversionCampaigns.length <= 2 ? "medium" : "high",
    message: `${zeroConversionCampaigns.length} high-spend campaign(s) have no recorded conversions.`,
    campaigns: zeroConversionCampaigns.slice(0, 5).map((campaign) => campaign.campaign)
  });

  checks.push({
    code: "CPA_OUTLIERS",
    label: "CPA outliers",
    status: highCpaCampaigns.length === 0 ? "pass" : highCpaCampaigns.length <= 2 ? "warn" : "fail",
    severity: highCpaCampaigns.length === 0 ? "low" : highCpaCampaigns.length <= 2 ? "medium" : "high",
    message: `${highCpaCampaigns.length} campaign(s) are at least 50% above the median CPA.`,
    campaigns: highCpaCampaigns.slice(0, 5).map((campaign) => campaign.campaign)
  });

  if (topCampaign) {
    const concentration = totals.cost > 0 ? topCampaign.cost / totals.cost : 0;
    checks.push({
      code: "BUDGET_CONCENTRATION",
      label: "Budget concentration",
      status: concentration <= 0.55 || topCampaign.score >= 70 ? "pass" : concentration <= 0.7 ? "warn" : "fail",
      severity: concentration <= 0.55 || topCampaign.score >= 70 ? "low" : concentration <= 0.7 ? "medium" : "high",
      message: `${topCampaign.campaign} represents ${round(concentration * 100)}% of spend.`
    });
  }

  checks.push({
    code: "WOW_ANOMALIES",
    label: "Week-over-week anomalies",
    status: anomalies.length === 0 ? "pass" : anomalies.some((item) => item.severity === "high") ? "fail" : "warn",
    severity: anomalies.length === 0 ? "low" : anomalies.some((item) => item.severity === "high") ? "high" : "medium",
    message:
      anomalies.length === 0
        ? "No material week-over-week anomalies were detected."
        : `${anomalies.length} material week-over-week movement(s) were detected.`
  });

  return checks;
};

export const analyzeCampaignPerformance = (rows) => {
  const totals = summarizeRows(rows);
  const campaigns = campaignSummaries(rows);
  const dailyTrend = buildDailyTrend(rows);
  const performanceScore = calculateScore(totals, campaigns);
  const anomalies = detectAnomalies(rows, campaigns);
  const checks = buildChecks({ totals, campaigns, anomalies, score: performanceScore });

  return {
    performanceScore,
    grade: gradeFromScore(performanceScore),
    totals,
    campaigns,
    dailyTrend,
    checks,
    anomalies
  };
};

