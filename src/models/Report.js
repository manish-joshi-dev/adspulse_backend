import mongoose from "mongoose";

const metricSchema = new mongoose.Schema(
  {
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    cost: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    ctr: { type: Number, default: 0 },
    cpc: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },
    cpa: { type: Number, default: 0 }
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    sourceFile: {
      type: String,
      required: true
    },
    rowCount: {
      type: Number,
      required: true
    },
    performanceScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    grade: {
      type: String,
      required: true
    },
    totals: {
      type: metricSchema,
      required: true
    },
    campaigns: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    dailyTrend: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    checks: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    diagnostics: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    anomalies: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    scoreBreakdown: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    dataQuality: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    parsedMeta: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    recommendations: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    }
  },
  {
    timestamps: true
  }
);

reportSchema.index({ createdAt: -1 });
reportSchema.index({ uploadedBy: 1, createdAt: -1 });

export const Report = mongoose.models.Report || mongoose.model("Report", reportSchema);
