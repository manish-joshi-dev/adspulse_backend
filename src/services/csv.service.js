import fs from "fs/promises";
import { parse as parseCsv } from "csv-parse/sync";
import { formatISO, isValid, parse as parseDateWithFormat } from "date-fns";
import { ApiError } from "../utils/http.js";

const canonicalKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[\s_./()-]+/g, "")
    .replace(/[^a-z0-9]/g, "");

const numericValue = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const text = String(value || "").trim();
  if (!text || text === "--" || text.toLowerCase() === "nan") {
    return 0;
  }

  const negative = text.startsWith("(") && text.endsWith(")");
  const cleaned = text.replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return negative ? -parsed : parsed;
};

const normalizeDate = (value) => {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  const nativeDate = new Date(text);
  if (isValid(nativeDate)) {
    return formatISO(nativeDate, { representation: "date" });
  }

  const formats = ["MM/dd/yyyy", "M/d/yyyy", "dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd"];
  for (const format of formats) {
    const parsed = parseDateWithFormat(text, format, new Date());
    if (isValid(parsed)) {
      return formatISO(parsed, { representation: "date" });
    }
  }

  return null;
};

const valueFor = (record, aliases) => {
  const normalized = new Map(
    Object.entries(record).map(([key, value]) => [canonicalKey(key), value])
  );

  for (const alias of aliases) {
    const value = normalized.get(canonicalKey(alias));
    if (value !== undefined) {
      return value;
    }
  }

  return "";
};

const normalizeRow = (record) => {
  const campaign = String(
    valueFor(record, ["Campaign", "Campaign name", "CampaignName"])
  ).trim();

  if (!campaign || campaign.toLowerCase().startsWith("total")) {
    return null;
  }

  const clicks = numericValue(valueFor(record, ["Clicks"]));
  const impressions = numericValue(valueFor(record, ["Impr.", "Impressions", "Impr"]));
  const cost = numericValue(valueFor(record, ["Cost", "Cost (USD)", "Spend"]));
  const conversions = numericValue(
    valueFor(record, ["Conversions", "Conv.", "All conv.", "Conversions by conv. time"])
  );
  const ctr = numericValue(valueFor(record, ["CTR", "Click-through rate"]));
  const cpc = numericValue(valueFor(record, ["Avg. CPC", "Average CPC", "CPC"]));
  const conversionRate = numericValue(valueFor(record, ["Conv. rate", "Conversion rate"]));
  const cpa = numericValue(valueFor(record, ["Cost / conv.", "CPA", "Cost per conversion"]));

  return {
    campaign,
    date: normalizeDate(valueFor(record, ["Day", "Date", "Week"])),
    status: String(valueFor(record, ["Campaign status", "Status"])).trim() || "Unknown",
    impressions,
    clicks,
    cost,
    conversions,
    ctr,
    cpc,
    conversionRate,
    cpa,
    raw: record
  };
};

const extractCsvBody = (raw) => {
  const lines = raw.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => {
    const normalized = canonicalKey(line);
    return normalized.includes("campaign") && normalized.includes("clicks");
  });

  if (headerIndex > 0) {
    return lines.slice(headerIndex).join("\n");
  }

  return raw;
};

export const parseGoogleAdsCsv = async (filePath) => {
  const raw = await fs.readFile(filePath, "utf8");
  const csvBody = extractCsvBody(raw);
  const records = parseCsv(csvBody, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
    relax_quotes: true
  });

  const rows = records.map(normalizeRow).filter(Boolean);
  if (rows.length === 0) {
    throw new ApiError(400, "The CSV did not contain campaign performance rows");
  }

  return rows;
};

