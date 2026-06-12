import fs from "fs";
import { parse } from "csv-parse/sync";

const IMPORTANT_COLUMNS = [
  "campaign",
  "clicks",
  "impressions",
  "cost",
  "conversions",
  "conversionValue",
  "date"
];

const COLUMN_ALIASES = new Map([
  ["campaign", "campaign"],
  ["campaignname", "campaign"],
  ["adgroup", "adGroup"],
  ["adgroupname", "adGroup"],
  ["keyword", "keyword"],
  ["keywordtext", "keyword"],
  ["clicks", "clicks"],
  ["impressions", "impressions"],
  ["impr", "impressions"],
  ["cost", "cost"],
  ["spend", "cost"],
  ["costgbp", "cost"],
  ["costusd", "cost"],
  ["conversions", "conversions"],
  ["convvalue", "conversionValue"],
  ["conversionvalue", "conversionValue"],
  ["ctr", "ctr"],
  ["avgcpc", "avgCPC"],
  ["averagecpc", "avgCPC"],
  ["qualityscore", "qualityScore"],
  ["qualscore", "qualityScore"],
  ["searchimprshare", "impressionShare"],
  ["searchimpressionshare", "impressionShare"],
  ["searchlostisbudget", "lostISBudget"],
  ["searchlostisrank", "lostISRank"],
  ["week", "date"],
  ["day", "date"],
  ["month", "date"],
  ["date", "date"],
  ["convrate", "conversionRate"],
  ["conversionrate", "conversionRate"],
  ["bouncerate", "bounceRate"],
  ["allconv", "allConversions"]
]);

const canonicalHeader = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[£$€]/g, "")
    .replace(/[\s_./()%()-]+/g, "")
    .replace(/[^a-z0-9]/g, "");

const isBlank = (value) => value === undefined || value === null || String(value).trim() === "";

const parseInteger = (value) => {
  if (isBlank(value) || String(value).trim() === "--") return 0;
  const parsed = Number.parseInt(String(value).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseFloatValue = (value) => {
  if (isBlank(value) || String(value).trim() === "--") return 0;
  const text = String(value).trim();
  const negative = text.startsWith("(") && text.endsWith(")");
  const parsed = Number.parseFloat(text.replace(/,/g, "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -parsed : parsed;
};

const parseNullableInteger = (value) => {
  if (isBlank(value) || String(value).trim() === "--") return null;
  const parsed = Number.parseInt(String(value).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parsePercentage = (value) => {
  if (isBlank(value) || String(value).trim() === "--") return null;
  const text = String(value).trim();

  if (/^<\s*10\s*%$/.test(text)) {
    return 0.09;
  }

  if (/^>\s*90\s*%$/.test(text)) {
    return 0.91;
  }

  const parsed = Number.parseFloat(text.replace(/,/g, "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return text.includes("%") ? parsed / 100 : parsed;
};

const parseDateValue = (value) => {
  if (isBlank(value) || String(value).trim() === "--") return null;

  const text = String(value).trim();
  const rangeStart = text.split(/\s+-\s+|\s+to\s+/i)[0]?.trim();
  const nativeDate = new Date(rangeStart);

  if (!Number.isNaN(nativeDate.getTime())) {
    return nativeDate.toISOString().slice(0, 10);
  }

  const slashMatch = rangeStart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year = Number(slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3]);
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }

  return null;
};

const parseMetricValue = (canonicalName, value) => {
  switch (canonicalName) {
    case "clicks":
    case "impressions":
      return parseInteger(value);
    case "cost":
    case "conversions":
    case "conversionValue":
    case "avgCPC":
    case "allConversions":
      return parseFloatValue(value);
    case "ctr":
    case "impressionShare":
    case "lostISBudget":
    case "lostISRank":
    case "conversionRate":
    case "bounceRate":
      return parsePercentage(value);
    case "qualityScore":
      return parseNullableInteger(value);
    case "date":
      return parseDateValue(value);
    default:
      return isBlank(value) ? null : String(value).trim();
  }
};

const findHeaderLineIndex = (lines) =>
  lines.findIndex((line) => {
    const normalized = line
      .split(",")
      .map((header) => COLUMN_ALIASES.get(canonicalHeader(header)))
      .filter(Boolean);

    return normalized.includes("campaign") && normalized.some((name) => IMPORTANT_COLUMNS.includes(name));
  });

const readCsvBody = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  if (!raw.trim()) {
    throw new Error("CSV file is empty");
  }

  const lines = raw.split(/\r?\n/);
  const headerIndex = findHeaderLineIndex(lines);
  if (headerIndex === -1) {
    throw new Error("No recognizable Google Ads columns found. Upload a Google Ads CSV export.");
  }

  return lines.slice(headerIndex).join("\n");
};

const normalizeRecord = (record, recognizedColumns) => {
  const row = {};

  for (const [rawKey, value] of Object.entries(record)) {
    const canonicalName = COLUMN_ALIASES.get(canonicalHeader(rawKey));
    if (!canonicalName) continue;

    recognizedColumns.add(canonicalName);
    row[canonicalName] = parseMetricValue(canonicalName, value);
  }

  row.campaign = row.campaign || "Unassigned campaign";
  row.adGroup = row.adGroup || "Unassigned ad group";
  row.keyword = row.keyword || "Unassigned keyword";
  row.clicks = row.clicks || 0;
  row.impressions = row.impressions || 0;
  row.cost = row.cost || 0;
  row.conversions = row.conversions || 0;
  row.conversionValue = row.conversionValue || 0;
  row.allConversions = row.allConversions || 0;

  return row;
};

const createAccumulator = (name) => ({
  name,
  totalClicks: 0,
  totalImpressions: 0,
  totalCost: 0,
  totalConversions: 0,
  totalConversionValue: 0,
  qualityScoreTotal: 0,
  qualityScoreCount: 0,
  impressionShareTotal: 0,
  impressionShareCount: 0,
  lostISBudgetTotal: 0,
  lostISBudgetCount: 0,
  lostISRankTotal: 0,
  lostISRankCount: 0,
  rowCount: 0,
  dateRange: { start: null, end: null }
});

const addDateToRange = (dateRange, date) => {
  if (!date) return;
  if (!dateRange.start || date < dateRange.start) dateRange.start = date;
  if (!dateRange.end || date > dateRange.end) dateRange.end = date;
};

const addMetricToAccumulator = (accumulator, row) => {
  accumulator.totalClicks += row.clicks || 0;
  accumulator.totalImpressions += row.impressions || 0;
  accumulator.totalCost += row.cost || 0;
  accumulator.totalConversions += row.conversions || 0;
  accumulator.totalConversionValue += row.conversionValue || 0;
  accumulator.rowCount += 1;
  addDateToRange(accumulator.dateRange, row.date);

  if (row.qualityScore !== null && row.qualityScore !== undefined) {
    accumulator.qualityScoreTotal += row.qualityScore;
    accumulator.qualityScoreCount += 1;
  }

  if (row.impressionShare !== null && row.impressionShare !== undefined) {
    accumulator.impressionShareTotal += row.impressionShare;
    accumulator.impressionShareCount += 1;
  }

  if (row.lostISBudget !== null && row.lostISBudget !== undefined) {
    accumulator.lostISBudgetTotal += row.lostISBudget;
    accumulator.lostISBudgetCount += 1;
  }

  if (row.lostISRank !== null && row.lostISRank !== undefined) {
    accumulator.lostISRankTotal += row.lostISRank;
    accumulator.lostISRankCount += 1;
  }
};

const round = (value, digits = 6) => {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
};

const finalizeAccumulator = (accumulator) => ({
  name: accumulator.name,
  totalClicks: accumulator.totalClicks,
  totalImpressions: accumulator.totalImpressions,
  totalCost: round(accumulator.totalCost, 2),
  totalConversions: round(accumulator.totalConversions, 4),
  totalConversionValue: round(accumulator.totalConversionValue, 2),
  avgCTR:
    accumulator.totalImpressions > 0
      ? round(accumulator.totalClicks / accumulator.totalImpressions)
      : 0,
  avgCPC:
    accumulator.totalClicks > 0 ? round(accumulator.totalCost / accumulator.totalClicks, 2) : 0,
  avgConversionRate:
    accumulator.totalClicks > 0
      ? round(accumulator.totalConversions / accumulator.totalClicks)
      : 0,
  ROAS:
    accumulator.totalCost > 0
      ? round(accumulator.totalConversionValue / accumulator.totalCost, 4)
      : 0,
  avgQualityScore:
    accumulator.qualityScoreCount > 0
      ? round(accumulator.qualityScoreTotal / accumulator.qualityScoreCount, 2)
      : null,
  avgImpressionShare:
    accumulator.impressionShareCount > 0
      ? round(accumulator.impressionShareTotal / accumulator.impressionShareCount)
      : null,
  avgLostISBudget:
    accumulator.lostISBudgetCount > 0
      ? round(accumulator.lostISBudgetTotal / accumulator.lostISBudgetCount)
      : null,
  avgLostISRank:
    accumulator.lostISRankCount > 0
      ? round(accumulator.lostISRankTotal / accumulator.lostISRankCount)
      : null,
  rowCount: accumulator.rowCount,
  dateRange: accumulator.dateRange
});

const addToGroup = (map, key, row) => {
  const safeKey = key || "Unassigned";
  if (!map.has(safeKey)) {
    map.set(safeKey, createAccumulator(safeKey));
  }
  addMetricToAccumulator(map.get(safeKey), row);
};

const aggregateRows = (rows) => {
  const campaignAccumulators = new Map();
  const adGroupAccumulators = new Map();
  const keywordAccumulators = new Map();

  for (const row of rows) {
    addToGroup(campaignAccumulators, row.campaign, row);
    addToGroup(adGroupAccumulators, row.adGroup, row);
    addToGroup(keywordAccumulators, row.keyword, row);
  }

  const finalizeMap = (map) =>
    new Map([...map.entries()].map(([key, accumulator]) => [key, finalizeAccumulator(accumulator)]));

  return {
    campaigns: finalizeMap(campaignAccumulators),
    adGroups: finalizeMap(adGroupAccumulators),
    keywords: finalizeMap(keywordAccumulators)
  };
};

const calculateDateRange = (rows) => {
  const datedRows = rows.filter((row) => row.date).sort((a, b) => a.date.localeCompare(b.date));
  if (datedRows.length === 0) {
    return { start: null, end: null };
  }

  return {
    start: datedRows[0].date,
    end: datedRows[datedRows.length - 1].date
  };
};

const daysBetween = (start, end) => {
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
};

const addDays = (date, days) => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const splitPeriods = (rows, dateRange) => {
  const datedRows = rows.filter((row) => row.date).sort((a, b) => a.date.localeCompare(b.date));
  if (!dateRange.start || !dateRange.end || datedRows.length === 0) {
    return { current: rows, previous: null };
  }

  const totalDays = daysBetween(dateRange.start, dateRange.end);
  if (totalDays <= 7) {
    return { current: datedRows, previous: null };
  }

  if (totalDays >= 14) {
    const currentStart = addDays(dateRange.end, -6);
    const previousStart = addDays(currentStart, -7);

    const current = datedRows.filter((row) => row.date >= currentStart && row.date <= dateRange.end);
    const previous = datedRows.filter((row) => row.date >= previousStart && row.date < currentStart);

    return {
      current,
      previous: previous.length > 0 ? previous : null
    };
  }

  const uniqueDates = [...new Set(datedRows.map((row) => row.date))];
  const splitDate = uniqueDates[Math.floor(uniqueDates.length / 2)];
  const previous = datedRows.filter((row) => row.date < splitDate);
  const current = datedRows.filter((row) => row.date >= splitDate);

  return {
    current,
    previous: previous.length > 0 ? previous : null
  };
};

const buildDataQuality = (recognizedColumns) => {
  const hasDateColumn = recognizedColumns.has("date");
  const hasCostData = recognizedColumns.has("cost");
  const hasConversionData =
    recognizedColumns.has("conversions") || recognizedColumns.has("allConversions");
  const hasQualityScoreData = recognizedColumns.has("qualityScore");
  const hasImpressionShareData = recognizedColumns.has("impressionShare");
  const missingColumns = IMPORTANT_COLUMNS.filter((column) => !recognizedColumns.has(column));
  const warningMessages = [];

  if (!hasDateColumn) warningMessages.push("Date data missing - period comparisons will be skipped");
  if (!hasCostData) warningMessages.push("Cost data missing - spend diagnostics will be skipped");
  if (!hasConversionData) warningMessages.push("Conversion data missing - conversion diagnostics will be skipped");
  if (!hasQualityScoreData) warningMessages.push("Quality Score data missing - QS diagnostics will be skipped");
  if (!hasImpressionShareData) {
    warningMessages.push("Impression share data missing - impression share diagnostics will be skipped");
  }

  return {
    hasDateColumn,
    hasCostData,
    hasConversionData,
    hasQualityScoreData,
    hasImpressionShareData,
    missingColumns,
    warningMessages
  };
};

export const parseGoogleAdsCSV = async (filePath) => {
  const csvBody = readCsvBody(filePath);
  const recognizedColumns = new Set();

  const records = parse(csvBody, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const rows = records
    .map((record) => normalizeRecord(record, recognizedColumns))
    .filter((row) => row.campaign && !String(row.campaign).toLowerCase().startsWith("total"));

  if (recognizedColumns.size === 0) {
    throw new Error("No recognizable Google Ads columns found. Upload a Google Ads CSV export.");
  }

  if (rows.length < 2) {
    throw new Error("At least 2 data rows are required for diagnostic analysis.");
  }

  const { campaigns, adGroups, keywords } = aggregateRows(rows);
  const dateRange = calculateDateRange(rows);
  const periods = splitPeriods(rows, dateRange);
  const dataQuality = buildDataQuality(recognizedColumns);
  const dateRangeLabel =
    dateRange.start && dateRange.end ? `${dateRange.start} to ${dateRange.end}` : "No date range";

  return {
    rows,
    campaigns,
    adGroups,
    keywords,
    dateRange,
    periods,
    meta: {
      rowCount: rows.length,
      campaignCount: campaigns.size,
      adGroupCount: adGroups.size,
      keywordCount: keywords.size,
      dateRangeLabel
    },
    dataQuality
  };
};

