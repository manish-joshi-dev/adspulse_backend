export const BENCHMARKS = {
  CTR: {
    search: 0.0191,
    display: 0.0035,
    shopping: 0.0086
  },
  CPC: {
    low: 1.0,
    high: 5.0
  },
  CONVERSION_RATE: 0.0329,
  ROAS: 2.0,
  QUALITY_SCORE: {
    poor: 5,
    good: 7,
    excellent: 9
  },
  IMPRESSION_SHARE: {
    low: 0.4,
    good: 0.7
  },
  LOST_IS_BUDGET_THRESHOLD: 0.2,
  LOST_IS_RANK_THRESHOLD: 0.3,
  MIN_CTR_FOR_ZERO_IMPRESSION_FLAG: 0,
  ZERO_IMPRESSION_DAYS: 7
};

const METRICS_FOR_ANOMALIES = ["clicks", "impressions", "cost", "ctr", "conversionRate", "roas"];

const clamp = (value, min = 0, max = 100) => Math.min(Math.max(value, min), max);

const round = (value, digits = 4) => {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
};

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asNullableNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const mean = (values) => {
  const validValues = values.filter(Number.isFinite);
  if (validValues.length === 0) return 0;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
};

const stdDev = (values) => {
  const validValues = values.filter(Number.isFinite);
  if (validValues.length <= 1) return 0;
  const average = mean(validValues);
  const variance =
    validValues.reduce((sum, value) => sum + (value - average) ** 2, 0) / validValues.length;
  return Math.sqrt(variance);
};

const median = (values) => {
  const validValues = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (validValues.length === 0) return 0;
  const middle = Math.floor(validValues.length / 2);
  return validValues.length % 2 === 0
    ? (validValues[middle - 1] + validValues[middle]) / 2
    : validValues[middle];
};

const percentDiff = (actual, benchmark) => {
  if (!Number.isFinite(actual) || !Number.isFinite(benchmark) || benchmark === 0) {
    return null;
  }
  return ((actual - benchmark) / benchmark) * 100;
};

const formatPercent = (value, digits = 2) => `${round(asNumber(value) * 100, digits)}%`;

const formatCurrency = (value) => `$${round(asNumber(value), 2)}`;

const collectionToArray = (collection) => {
  if (!collection) return [];

  if (collection instanceof Map) {
    return [...collection.entries()].map(([key, value]) => {
      const item = { ...value };
      if (!item.name) item.name = key;
      return item;
    });
  }

  if (Array.isArray(collection)) {
    return collection;
  }

  if (typeof collection === "object") {
    return Object.entries(collection).map(([key, value]) => {
      const item = { ...value };
      if (!item.name) item.name = key;
      return item;
    });
  }

  return [];
};

const metricValue = (entity, keys, fallback = 0) => {
  for (const key of keys) {
    const value = asNullableNumber(entity?.[key]);
    if (value !== null) return value;
  }
  return fallback;
};

const entityName = (entity, fallback = "Unknown entity") =>
  entity?.name || entity?.campaign || entity?.adGroup || entity?.keyword || fallback;

const diagnosticFlag = ({
  flagType,
  severity,
  affectedEntity,
  entityType,
  metricName,
  actualValue,
  benchmarkValue,
  delta,
  description
}) => ({
  flagType,
  severity,
  affectedEntity,
  entityType,
  metricName,
  actualValue: round(actualValue, 6),
  benchmarkValue: round(benchmarkValue, 6),
  delta: round(delta ?? 0, 2),
  description
});

const enrichCampaignsWithBounceRate = (campaigns, rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) return campaigns;

  const bounceRateByCampaign = new Map();

  for (const row of rows) {
    const campaign = row.campaign;
    const bounceRate = asNullableNumber(row.bounceRate);
    if (!campaign || bounceRate === null) continue;

    if (!bounceRateByCampaign.has(campaign)) {
      bounceRateByCampaign.set(campaign, { total: 0, count: 0 });
    }

    const bucket = bounceRateByCampaign.get(campaign);
    bucket.total += bounceRate;
    bucket.count += 1;
  }

  return campaigns.map((campaign) => {
    const name = entityName(campaign, "");
    const bucket = bounceRateByCampaign.get(name);
    if (!bucket || bucket.count === 0) return campaign;

    return {
      ...campaign,
      avgBounceRate: bucket.total / bucket.count
    };
  });
};

const checkLowCTR = (campaigns) => {
  const benchmark = BENCHMARKS.CTR.search;
  const warningThreshold = benchmark * 0.75;
  const criticalThreshold = benchmark * 0.5;

  return campaigns
    .filter((campaign) => metricValue(campaign, ["avgCTR", "ctr"]) < warningThreshold)
    .map((campaign) => {
      const actualValue = metricValue(campaign, ["avgCTR", "ctr"]);
      const delta = percentDiff(actualValue, benchmark);
      const severity = actualValue < criticalThreshold ? "critical" : "warning";
      const name = entityName(campaign, "Unknown campaign");

      return diagnosticFlag({
        flagType: "LOW_CTR",
        severity,
        affectedEntity: name,
        entityType: "campaign",
        metricName: "avgCTR",
        actualValue,
        benchmarkValue: benchmark,
        delta,
        description: `${name} has a CTR of ${formatPercent(actualValue)}, which is ${Math.abs(
          round(delta ?? 0, 1)
        )}% below the ${formatPercent(benchmark)} search benchmark.`
      });
    });
};

const checkHighCPCLowCVR = (campaigns) =>
  campaigns
    .filter((campaign) => {
      const avgCPC = metricValue(campaign, ["avgCPC", "cpc"]);
      const conversionRate = metricValue(campaign, ["avgConversionRate", "conversionRate"]);
      return avgCPC > BENCHMARKS.CPC.high && conversionRate < BENCHMARKS.CONVERSION_RATE * 0.5;
    })
    .map((campaign) => {
      const avgCPC = metricValue(campaign, ["avgCPC", "cpc"]);
      const conversionRate = metricValue(campaign, ["avgConversionRate", "conversionRate"]);
      const severity = avgCPC > BENCHMARKS.CPC.high * 2 ? "critical" : "warning";
      const name = entityName(campaign, "Unknown campaign");

      return diagnosticFlag({
        flagType: "HIGH_CPC_LOW_CVR",
        severity,
        affectedEntity: name,
        entityType: "campaign",
        metricName: "avgCPC",
        actualValue: avgCPC,
        benchmarkValue: BENCHMARKS.CPC.high,
        delta: percentDiff(avgCPC, BENCHMARKS.CPC.high),
        description: `${name} has an average CPC of ${formatCurrency(
          avgCPC
        )} while conversion rate is only ${formatPercent(
          conversionRate
        )}, indicating expensive traffic with weak conversion efficiency.`
      });
    });

const checkImpressionShareLoss = (campaigns) => {
  const flags = [];

  for (const campaign of campaigns) {
    const name = entityName(campaign, "Unknown campaign");
    const lostISBudget = asNullableNumber(campaign.avgLostISBudget ?? campaign.lostISBudget);
    const lostISRank = asNullableNumber(campaign.avgLostISRank ?? campaign.lostISRank);

    if (lostISBudget !== null && lostISBudget > BENCHMARKS.LOST_IS_BUDGET_THRESHOLD) {
      const severity =
        lostISBudget >= BENCHMARKS.LOST_IS_BUDGET_THRESHOLD * 2 ? "critical" : "warning";

      flags.push(
        diagnosticFlag({
          flagType: "BUDGET_IMPRESSION_LOSS",
          severity,
          affectedEntity: name,
          entityType: "campaign",
          metricName: "lostISBudget",
          actualValue: lostISBudget,
          benchmarkValue: BENCHMARKS.LOST_IS_BUDGET_THRESHOLD,
          delta: percentDiff(lostISBudget, BENCHMARKS.LOST_IS_BUDGET_THRESHOLD),
          description: `${name} is losing ${formatPercent(
            lostISBudget
          )} of eligible search impressions to budget limits.`
        })
      );
    }

    if (lostISRank !== null && lostISRank > BENCHMARKS.LOST_IS_RANK_THRESHOLD) {
      const severity =
        lostISRank >= BENCHMARKS.LOST_IS_RANK_THRESHOLD * 1.5 ? "critical" : "warning";

      flags.push(
        diagnosticFlag({
          flagType: "RANK_IMPRESSION_LOSS",
          severity,
          affectedEntity: name,
          entityType: "campaign",
          metricName: "lostISRank",
          actualValue: lostISRank,
          benchmarkValue: BENCHMARKS.LOST_IS_RANK_THRESHOLD,
          delta: percentDiff(lostISRank, BENCHMARKS.LOST_IS_RANK_THRESHOLD),
          description: `${name} is losing ${formatPercent(
            lostISRank
          )} of eligible search impressions because of ad rank.`
        })
      );
    }
  }

  return flags;
};

const checkZeroImpressions = (adGroups) =>
  adGroups
    .filter((adGroup) => metricValue(adGroup, ["totalImpressions", "impressions"]) < 10)
    .map((adGroup) => {
      const actualValue = metricValue(adGroup, ["totalImpressions", "impressions"]);
      const name = entityName(adGroup, "Unknown ad group");

      return diagnosticFlag({
        flagType: "ZERO_IMPRESSIONS",
        severity: "warning",
        affectedEntity: name,
        entityType: "adGroup",
        metricName: "totalImpressions",
        actualValue,
        benchmarkValue: 10,
        delta: percentDiff(actualValue, 10),
        description: `${name} has fewer than 10 impressions over the period. Possible causes include paused ads, low bids, narrow targeting, or disapproved ads.`
      });
    });

const inferQualityScoreDriver = (keyword) => {
  const ctr = asNullableNumber(keyword.avgCTR ?? keyword.ctr);
  const conversionRate = asNullableNumber(keyword.avgConversionRate ?? keyword.conversionRate);
  const clicks = metricValue(keyword, ["totalClicks", "clicks"]);
  const impressions = metricValue(keyword, ["totalImpressions", "impressions"]);

  if (ctr !== null && ctr < BENCHMARKS.CTR.search * 0.75) {
    return "expected CTR is likely dragging Quality Score";
  }

  if (clicks === 0 && impressions > 0) {
    return "expected CTR and ad relevance are likely dragging Quality Score";
  }

  if (conversionRate !== null && conversionRate < BENCHMARKS.CONVERSION_RATE * 0.5) {
    return "landing page experience may be dragging Quality Score";
  }

  return "the weakest Quality Score component is unknown from the available columns";
};

const checkQualityScoreAnomalies = (keywords) =>
  keywords
    .filter((keyword) => {
      const qualityScore = asNullableNumber(keyword.avgQualityScore ?? keyword.qualityScore);
      return qualityScore !== null && qualityScore <= BENCHMARKS.QUALITY_SCORE.poor;
    })
    .map((keyword) => {
      const qualityScore = asNullableNumber(keyword.avgQualityScore ?? keyword.qualityScore);
      const severity = qualityScore <= 3 ? "critical" : "warning";
      const name = entityName(keyword, "Unknown keyword");
      const driver = inferQualityScoreDriver(keyword);

      return diagnosticFlag({
        flagType: "QUALITY_SCORE_ANOMALY",
        severity,
        affectedEntity: name,
        entityType: "keyword",
        metricName: "qualityScore",
        actualValue: qualityScore,
        benchmarkValue: BENCHMARKS.QUALITY_SCORE.poor,
        delta: percentDiff(qualityScore, BENCHMARKS.QUALITY_SCORE.poor),
        description: `${name} has a Quality Score of ${round(
          qualityScore,
          1
        )}. Based on available data, ${driver}.`
      });
    });

const checkLowROAS = (campaigns) =>
  campaigns
    .filter((campaign) => {
      const roas = metricValue(campaign, ["ROAS", "roas"]);
      const cost = metricValue(campaign, ["totalCost", "cost"]);
      return roas < BENCHMARKS.ROAS && cost > 100;
    })
    .map((campaign) => {
      const roas = metricValue(campaign, ["ROAS", "roas"]);
      const cost = metricValue(campaign, ["totalCost", "cost"]);
      const severity = roas < 0.5 ? "critical" : "warning";
      const name = entityName(campaign, "Unknown campaign");

      return diagnosticFlag({
        flagType: "LOW_ROAS",
        severity,
        affectedEntity: name,
        entityType: "campaign",
        metricName: "ROAS",
        actualValue: roas,
        benchmarkValue: BENCHMARKS.ROAS,
        delta: percentDiff(roas, BENCHMARKS.ROAS),
        description: `${name} has ROAS of ${round(roas, 2)} on ${formatCurrency(
          cost
        )} spend, below the minimum healthy ROAS benchmark of ${BENCHMARKS.ROAS}.`
      });
    });

const checkHighBounceSpend = (campaigns) =>
  campaigns
    .filter((campaign) => {
      const bounceRate = asNullableNumber(campaign.avgBounceRate ?? campaign.bounceRate);
      const cost = metricValue(campaign, ["totalCost", "cost"]);
      return bounceRate !== null && bounceRate > 0.7 && cost > 50;
    })
    .map((campaign) => {
      const bounceRate = asNullableNumber(campaign.avgBounceRate ?? campaign.bounceRate);
      const cost = metricValue(campaign, ["totalCost", "cost"]);
      const name = entityName(campaign, "Unknown campaign");

      return diagnosticFlag({
        flagType: "HIGH_BOUNCE_SPEND",
        severity: "warning",
        affectedEntity: name,
        entityType: "campaign",
        metricName: "bounceRate",
        actualValue: bounceRate,
        benchmarkValue: 0.7,
        delta: percentDiff(bounceRate, 0.7),
        description: `${name} has a bounce rate of ${formatPercent(
          bounceRate
        )} on ${formatCurrency(cost)} spend, indicating inefficient post-click traffic.`
      });
    });

export const runDiagnostics = (parsedData) => {
  const campaigns = enrichCampaignsWithBounceRate(
    collectionToArray(parsedData?.campaigns),
    parsedData?.rows || []
  );
  const adGroups = collectionToArray(parsedData?.adGroups);
  const keywords = collectionToArray(parsedData?.keywords);

  return [
    ...checkLowCTR(campaigns),
    ...checkHighCPCLowCVR(campaigns),
    ...checkImpressionShareLoss(campaigns),
    ...checkZeroImpressions(adGroups),
    ...checkQualityScoreAnomalies(keywords),
    ...checkLowROAS(campaigns),
    ...checkHighBounceSpend(campaigns)
  ].sort((a, b) => {
    const severityRank = { critical: 0, warning: 1, info: 2 };
    return severityRank[a.severity] - severityRank[b.severity];
  });
};

const scoreBandFor = (totalScore) => {
  if (totalScore >= 80) return "Excellent";
  if (totalScore >= 60) return "Good";
  if (totalScore >= 40) return "Average";
  if (totalScore >= 20) return "Poor";
  return "Critical";
};

export const computePerformanceScore = (campaigns, diagnostics = []) => {
  void diagnostics;

  const campaignList = collectionToArray(campaigns);
  const ctrMedian = median(campaignList.map((campaign) => metricValue(campaign, ["avgCTR", "ctr"])));
  const roasMedian = median(campaignList.map((campaign) => metricValue(campaign, ["ROAS", "roas"])));
  const conversionRateMedian = median(
    campaignList.map((campaign) => metricValue(campaign, ["avgConversionRate", "conversionRate"]))
  );
  const impressionShareMedian = median(
    campaignList
      .map((campaign) => asNullableNumber(campaign.avgImpressionShare ?? campaign.impressionShare))
      .filter((value) => value !== null)
  );

  const ctrScore = clamp((ctrMedian / BENCHMARKS.CTR.search) * 25, 0, 25);
  const roasScore = roasMedian <= 0 ? 0 : clamp((roasMedian / 4) * 25, 0, 25);
  const conversionScore = clamp(
    (conversionRateMedian / BENCHMARKS.CONVERSION_RATE) * 25,
    0,
    25
  );
  const impressionShareScore =
    impressionShareMedian <= 0.2
      ? 0
      : clamp(
          ((impressionShareMedian - 0.2) / (BENCHMARKS.IMPRESSION_SHARE.good - 0.2)) * 25,
          0,
          25
        );

  const totalScore = clamp(
    ctrScore + roasScore + conversionScore + impressionShareScore,
    0,
    100
  );

  const roundedTotalScore = round(totalScore, 2);

  return {
    totalScore: roundedTotalScore,
    scoreBreakdown: {
      ctrScore: round(ctrScore, 2),
      roasScore: round(roasScore, 2),
      conversionScore: round(conversionScore, 2),
      impressionShareScore: round(impressionShareScore, 2)
    },
    scoreBand: scoreBandFor(roundedTotalScore)
  };
};

const aggregateRowsByCampaign = (rows = []) => {
  const grouped = new Map();

  for (const row of rows) {
    const name = row.campaign || "Unassigned campaign";
    if (!grouped.has(name)) {
      grouped.set(name, {
        name,
        clicks: 0,
        impressions: 0,
        cost: 0,
        conversions: 0,
        conversionValue: 0
      });
    }

    const campaign = grouped.get(name);
    campaign.clicks += asNumber(row.clicks);
    campaign.impressions += asNumber(row.impressions);
    campaign.cost += asNumber(row.cost);
    campaign.conversions += asNumber(row.conversions);
    campaign.conversionValue += asNumber(row.conversionValue);
  }

  for (const campaign of grouped.values()) {
    campaign.ctr = campaign.impressions > 0 ? campaign.clicks / campaign.impressions : 0;
    campaign.conversionRate = campaign.clicks > 0 ? campaign.conversions / campaign.clicks : 0;
    campaign.roas = campaign.cost > 0 ? campaign.conversionValue / campaign.cost : 0;
  }

  return grouped;
};

const periodLabel = (rows) => {
  const dates = rows
    .map((row) => row.date)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  if (dates.length === 0) return "undated period";
  return dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} to ${dates[dates.length - 1]}`;
};

const anomalyObject = ({ metricName, affectedEntity, currentValue, previousValue, changePercent, zScore, period }) => ({
  metricName,
  affectedEntity,
  currentValue: round(currentValue, 6),
  previousValue: round(previousValue, 6),
  changePercent: round(changePercent, 2),
  direction: changePercent >= 0 ? "increase" : "decrease",
  zScore: round(zScore, 4),
  period
});

export const detectAnomalies = (parsedData) => {
  const currentRows = parsedData?.periods?.current || [];
  const previousRows = parsedData?.periods?.previous || null;

  if (!previousRows || previousRows.length === 0) {
    const anomalies = [];
    anomalies.note = "Previous period data is not available; anomaly detection skipped.";
    return anomalies;
  }

  const currentByCampaign = aggregateRowsByCampaign(currentRows);
  const previousByCampaign = aggregateRowsByCampaign(previousRows);
  const metricStats = new Map();

  for (const metric of METRICS_FOR_ANOMALIES) {
    const values = [...currentByCampaign.values()].map((campaign) => campaign[metric]);
    metricStats.set(metric, {
      mean: mean(values),
      stdDev: stdDev(values)
    });
  }

  const anomalies = [];
  const currentLabel = periodLabel(currentRows);
  const previousLabel = periodLabel(previousRows);
  const period = `Week of ${currentLabel} vs ${previousLabel}`;

  for (const [campaignName, current] of currentByCampaign.entries()) {
    const previous = previousByCampaign.get(campaignName);
    if (!previous) continue;

    for (const metric of METRICS_FOR_ANOMALIES) {
      const currentValue = current[metric];
      const previousValue = previous[metric];
      const changePercent = percentDiff(currentValue, previousValue);
      if (changePercent === null) continue;

      const stats = metricStats.get(metric);
      const zScore = stats.stdDev === 0 ? 0 : (currentValue - stats.mean) / stats.stdDev;

      if (Math.abs(changePercent) > 15 && Math.abs(zScore) > 1.5) {
        anomalies.push(
          anomalyObject({
            metricName: metric,
            affectedEntity: campaignName,
            currentValue,
            previousValue,
            changePercent,
            zScore,
            period
          })
        );
      }
    }
  }

  return anomalies;
};
