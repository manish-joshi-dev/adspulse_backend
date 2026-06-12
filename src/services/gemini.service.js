import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config/env.js";

const MODEL_NAME = "gemini-1.5-flash";
const MAX_CALLS_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

const VALID_PRIORITIES = new Set(["high", "medium", "low"]);
const VALID_CATEGORIES = new Set([
  "bidding",
  "keywords",
  "ad_copy",
  "budget",
  "targeting",
  "quality_score",
  "structure"
]);

const VALID_FLAG_TYPES = new Set([
  "LOW_CTR",
  "HIGH_CPC_LOW_CVR",
  "BUDGET_IMPRESSION_LOSS",
  "RANK_IMPRESSION_LOSS",
  "ZERO_IMPRESSIONS",
  "QUALITY_SCORE_ANOMALY",
  "HIGH_BOUNCE_SPEND",
  "LOW_ROAS"
]);

const severityRank = {
  critical: 0,
  warning: 1,
  info: 2
};

let callTimestamps = [];
let geminiModel = null;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getGeminiModel = () => {
  if (!config.geminiApiKey) {
    return null;
  }

  if (!geminiModel) {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    geminiModel = genAI.getGenerativeModel({ model: MODEL_NAME });
  }

  return geminiModel;
};

const canCallGemini = () => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  callTimestamps = callTimestamps.filter((timestamp) => timestamp > cutoff);
  return callTimestamps.length < MAX_CALLS_PER_MINUTE;
};

const recordGeminiCall = () => {
  callTimestamps.push(Date.now());
};

const round = (value, digits = 2) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(digits));
};

const normalizePriority = (priority, fallback = "medium") => {
  const value = String(priority || "").toLowerCase();
  return VALID_PRIORITIES.has(value) ? value : fallback;
};

const normalizeCategory = (category, fallback = "structure") => {
  const value = String(category || "").toLowerCase();
  return VALID_CATEGORIES.has(value) ? value : fallback;
};

const titleFromFlag = (flagType) =>
  String(flagType || "OPTIMIZATION")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .slice(0, 80);

const toUiRecommendation = (recommendation) => ({
  ...recommendation,
  rationale: recommendation.description,
  actionItems: recommendation.actionSteps,
  priorityLabel:
    recommendation.priority.charAt(0).toUpperCase() + recommendation.priority.slice(1)
});

const formatFlagsList = (diagnostics = []) => {
  if (diagnostics.length === 0) {
    return "No diagnostic flags detected.";
  }

  return diagnostics
    .map(
      (flag) =>
        `- [${String(flag.severity || "info").toUpperCase()}] ${flag.flagType}: ${
          flag.affectedEntity
        } - ${flag.description}`
    )
    .join("\n");
};

const formatAnomaliesList = (anomalies = []) => {
  if (anomalies.length === 0) {
    return "No material week-over-week anomalies detected.";
  }

  return anomalies
    .map((anomaly) => {
      const direction =
        anomaly.direction === "up"
          ? "increase"
          : anomaly.direction === "down"
            ? "decrease"
            : anomaly.direction;

      return `- ${anomaly.affectedEntity || anomaly.entity} ${
        anomaly.metricName || anomaly.metric
      }: ${round(anomaly.changePercent)}% change (${direction})`;
    })
    .join("\n");
};

const formatDataQualityWarnings = (dataQuality = {}) => {
  const warnings = dataQuality.warningMessages || [];
  if (warnings.length === 0) {
    return "No data quality warnings.";
  }

  return warnings.map((warning) => `- ${warning}`).join("\n");
};

const buildPrompt = (diagnostics, anomalies, campaignSummary, dataQuality) => {
  const summary = {
    campaignCount: campaignSummary?.campaignCount || 0,
    dateRange: campaignSummary?.dateRange || "Unknown",
    totalCost: round(campaignSummary?.totalCost || 0, 2),
    totalConversions: round(campaignSummary?.totalConversions || 0, 2),
    accountROAS: round(campaignSummary?.accountROAS || 0, 2),
    score: round(campaignSummary?.score || 0, 0),
    scoreBand: campaignSummary?.scoreBand || "Unknown"
  };

  return `You are a Google Ads optimization expert at Google's Performance Solutions Engineering team. Analyze the following Google Ads account diagnostic data and provide specific, actionable recommendations.

ACCOUNT SUMMARY:
- Total Campaigns: ${summary.campaignCount}
- Date Range: ${summary.dateRange}
- Total Spend: $${summary.totalCost}
- Total Conversions: ${summary.totalConversions}
- Account ROAS: ${summary.accountROAS}
- Performance Score: ${summary.score}/100 (${summary.scoreBand})

DIAGNOSTIC FLAGS DETECTED:
${formatFlagsList(diagnostics)}

WEEK-OVER-WEEK ANOMALIES:
${formatAnomaliesList(anomalies)}

DATA QUALITY NOTES:
${formatDataQualityWarnings(dataQuality)}

Based on these specific issues, provide exactly 5-8 actionable recommendations. For EACH recommendation, respond ONLY with a valid JSON array (no markdown, no explanation outside JSON) in this exact format:
[
  {
    "priority": "high|medium|low",
    "category": "bidding|keywords|ad_copy|budget|targeting|quality_score|structure",
    "title": "Short title (max 10 words)",
    "description": "Detailed explanation of the issue and why it matters (2-3 sentences)",
    "expectedImpact": "Specific expected improvement e.g. 'Estimated 20-35% CTR improvement'",
    "actionSteps": ["Step 1", "Step 2", "Step 3"],
    "relatedFlags": ["FLAG_TYPE_1", "FLAG_TYPE_2"]
  }
]

Rules:
- Reference specific campaign names from the data, not generic advice
- Action steps must be concrete Google Ads UI actions
- If no conversion data exists, do not recommend ROAS targets
- Prioritize critical severity flags first`;
};

const stripMarkdownFences = (responseText) => {
  const trimmed = String(responseText || "").trim();
  const withoutOpeningFence = trimmed.replace(/^```(?:json)?\s*/i, "");
  return withoutOpeningFence.replace(/\s*```$/i, "").trim();
};

const extractJsonArrayText = (responseText) => {
  const cleaned = stripMarkdownFences(responseText);
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");

  if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
    throw new Error("Gemini response did not contain a JSON array");
  }

  return cleaned.slice(firstBracket, lastBracket + 1);
};

const validateRecommendation = (item, index) => {
  const priority = normalizePriority(item.priority);
  const category = normalizeCategory(item.category);
  const title = String(item.title || `Recommendation ${index + 1}`).trim().slice(0, 80);
  const description = String(
    item.description || "Review the affected Google Ads entities and apply targeted optimizations."
  ).trim();
  const expectedImpact = String(
    item.expectedImpact || "Expected to improve account efficiency after the next data window."
  ).trim();
  const actionSteps = Array.isArray(item.actionSteps)
    ? item.actionSteps.map((step) => String(step).trim()).filter(Boolean).slice(0, 6)
    : [];
  const relatedFlags = Array.isArray(item.relatedFlags)
    ? item.relatedFlags.map((flag) => String(flag).trim()).filter(Boolean).slice(0, 8)
    : [];

  const recommendation = {
    priority,
    category,
    title,
    description,
    expectedImpact,
    actionSteps:
      actionSteps.length > 0
        ? actionSteps
        : [
            "Open the affected campaign in Google Ads.",
            "Review the flagged metric against the benchmark.",
            "Apply the recommended adjustment and monitor results."
          ],
    relatedFlags: relatedFlags.filter((flag) => VALID_FLAG_TYPES.has(flag))
  };

  return toUiRecommendation(recommendation);
};

const parseGeminiResponse = (responseText) => {
  const jsonText = extractJsonArrayText(responseText);
  const parsed = JSON.parse(jsonText);

  if (!Array.isArray(parsed)) {
    throw new Error("Gemini response JSON must be an array");
  }

  return parsed.slice(0, 8).map(validateRecommendation);
};

const fallbackTemplates = {
  LOW_CTR: {
    category: "ad_copy",
    title: "Refresh low CTR ads",
    expectedImpact: "Estimated 15-30% CTR improvement",
    actionSteps: [
      "Open the affected campaign and go to Ads.",
      "Create two new responsive search ad variants with stronger keyword alignment.",
      "Pin only legally required copy and let assets rotate for learning.",
      "Review search terms and add irrelevant queries as negatives."
    ]
  },
  HIGH_CPC_LOW_CVR: {
    category: "bidding",
    title: "Reduce inefficient CPCs",
    expectedImpact: "Estimated 10-25% CPA reduction",
    actionSteps: [
      "Open the campaign bid strategy settings.",
      "Lower manual bids or tighten target CPA on high-cost ad groups.",
      "Segment by search terms and pause expensive non-converting queries.",
      "Review device and audience bid adjustments."
    ]
  },
  BUDGET_IMPRESSION_LOSS: {
    category: "budget",
    title: "Fix budget impression loss",
    expectedImpact: "More eligible impressions for proven campaigns",
    actionSteps: [
      "Open Campaigns and sort by Search lost IS budget.",
      "Move budget from low-return campaigns to the affected campaign.",
      "If ROAS or CPA is healthy, increase the daily budget gradually.",
      "Check pacing again after three full days."
    ]
  },
  RANK_IMPRESSION_LOSS: {
    category: "quality_score",
    title: "Improve lost rank share",
    expectedImpact: "Estimated 10-20% impression share improvement",
    actionSteps: [
      "Open the affected campaign keywords.",
      "Improve ad relevance by grouping tightly related keywords.",
      "Raise bids only on terms with conversion value or strong intent.",
      "Review landing page speed and message match."
    ]
  },
  ZERO_IMPRESSIONS: {
    category: "structure",
    title: "Restore ad group delivery",
    expectedImpact: "Restores eligible serving for blocked inventory",
    actionSteps: [
      "Open the affected ad group status column.",
      "Check for paused ads, disapprovals, limited policy status, or missing keywords.",
      "Broaden overly restrictive match types or audiences.",
      "Raise bids if keywords are below first page estimates."
    ]
  },
  QUALITY_SCORE_ANOMALY: {
    category: "quality_score",
    title: "Repair quality score",
    expectedImpact: "Potential CPC reduction through stronger relevance",
    actionSteps: [
      "Open Keywords and add Quality Score component columns.",
      "Split low-relevance keywords into tighter ad groups.",
      "Add ad copy that repeats the main keyword theme naturally.",
      "Align landing page headlines and content to the query intent."
    ]
  },
  HIGH_BOUNCE_SPEND: {
    category: "targeting",
    title: "Cut high bounce spend",
    expectedImpact: "Estimated 10-20% wasted spend reduction",
    actionSteps: [
      "Open the campaign locations, audiences, and search terms.",
      "Exclude segments with high bounce rate and weak conversion signals.",
      "Send traffic to a more relevant landing page variant.",
      "Monitor bounce rate and conversion rate by segment."
    ]
  },
  LOW_ROAS: {
    category: "bidding",
    title: "Improve low ROAS spend",
    expectedImpact: "Estimated 15-35% ROAS improvement",
    actionSteps: [
      "Open the affected campaign and segment by search term.",
      "Pause or bid down high-spend terms without conversion value.",
      "Shift budget toward campaigns with stronger ROAS.",
      "Test target ROAS bidding only after conversion value tracking is reliable."
    ]
  }
};

const priorityFromSeverity = (severity) => {
  if (severity === "critical") return "high";
  if (severity === "warning") return "medium";
  return "low";
};

const fallbackFromFlag = (flag) => {
  const template = fallbackTemplates[flag.flagType] || {
    category: "structure",
    title: titleFromFlag(flag.flagType),
    expectedImpact: "Expected to improve account health after review",
    actionSteps: [
      "Open the affected entity in Google Ads.",
      "Compare current performance against the diagnostic benchmark.",
      "Apply one controlled change and review results after the next data window."
    ]
  };

  return toUiRecommendation({
    priority: priorityFromSeverity(flag.severity),
    category: template.category,
    title: template.title,
    description: `${flag.affectedEntity} triggered ${flag.flagType}. ${flag.description}`,
    expectedImpact: template.expectedImpact,
    actionSteps: template.actionSteps,
    relatedFlags: [flag.flagType]
  });
};

const getFallbackRecommendations = (diagnostics = []) => {
  const sortedDiagnostics = [...diagnostics].sort(
    (a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3)
  );

  const recommendations = [];
  const seenKeys = new Set();

  for (const flag of sortedDiagnostics) {
    const key = `${flag.flagType}:${flag.affectedEntity}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    recommendations.push(fallbackFromFlag(flag));
    if (recommendations.length === 5) break;
  }

  if (recommendations.length > 0) {
    return recommendations;
  }

  return [
    toUiRecommendation({
      priority: "medium",
      category: "structure",
      title: "Review campaign structure",
      description:
        "No critical diagnostic flags were detected, but the account should still be reviewed for budget concentration, search term quality, and conversion tracking consistency.",
      expectedImpact: "Keeps account performance stable as spend scales",
      actionSteps: [
        "Open Campaigns and compare spend, conversions, and ROAS by campaign.",
        "Review search terms for irrelevant spend.",
        "Confirm conversion actions and values are current."
      ],
      relatedFlags: []
    })
  ];
};

const callGeminiWithRetry = async (model, prompt) => {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      if (!canCallGemini()) {
        throw new Error("Gemini rate limit reached during retry window");
      }
      recordGeminiCall();
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError;
};

export const generateRecommendations = async (
  diagnostics = [],
  anomalies = [],
  campaignSummary = {},
  dataQuality = {}
) => {
  const model = getGeminiModel();

  if (!model) {
    return getFallbackRecommendations(diagnostics);
  }

  if (!canCallGemini()) {
    console.warn("Gemini rate limit reached. Falling back to rule-based recommendations.");
    return getFallbackRecommendations(diagnostics);
  }

  try {
    const prompt = buildPrompt(diagnostics, anomalies, campaignSummary, dataQuality);
    const responseText = await callGeminiWithRetry(model, prompt);
    const recommendations = parseGeminiResponse(responseText);
    return recommendations.length > 0 ? recommendations : getFallbackRecommendations(diagnostics);
  } catch (error) {
    console.warn(`Gemini recommendation generation failed: ${error.message}`);
    return getFallbackRecommendations(diagnostics);
  }
};
