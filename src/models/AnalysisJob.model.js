import mongoose from "mongoose";

const diagnosticFlagTypes = [
  "LOW_CTR",
  "HIGH_CPC_LOW_CVR",
  "BUDGET_IMPRESSION_LOSS",
  "RANK_IMPRESSION_LOSS",
  "ZERO_IMPRESSIONS",
  "QUALITY_SCORE_ANOMALY",
  "HIGH_BOUNCE_SPEND",
  "LOW_ROAS"
];

const recommendationCategories = [
  "bidding",
  "keywords",
  "ad_copy",
  "budget",
  "targeting",
  "quality_score",
  "structure"
];

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const numberRange = (min, max) => ({
  type: Number,
  min: [min, `Value cannot be less than ${min}`],
  max: [max, `Value cannot be greater than ${max}`]
});

const diagnosticFlagSchema = new mongoose.Schema(
  {
    flagType: {
      type: String,
      enum: {
        values: diagnosticFlagTypes,
        message: "Diagnostic flag type is not supported"
      },
      required: [true, "Diagnostic flag type is required"]
    },
    severity: {
      type: String,
      enum: {
        values: ["critical", "warning", "info"],
        message: "Severity must be critical, warning, or info"
      },
      required: [true, "Severity is required"]
    },
    affectedEntity: {
      type: String,
      trim: true,
      required: [true, "Affected entity is required"]
    },
    entityType: {
      type: String,
      enum: {
        values: ["campaign", "adGroup", "keyword"],
        message: "Entity type must be campaign, adGroup, or keyword"
      },
      required: [true, "Entity type is required"]
    },
    metricName: {
      type: String,
      trim: true,
      required: [true, "Metric name is required"]
    },
    actualValue: {
      type: Number,
      required: [true, "Actual value is required"]
    },
    benchmarkValue: {
      type: Number,
      required: [true, "Benchmark value is required"]
    },
    delta: {
      type: Number,
      required: [true, "Delta is required"]
    },
    description: {
      type: String,
      trim: true,
      required: [true, "Description is required"]
    }
  },
  { _id: false }
);

const anomalySchema = new mongoose.Schema(
  {
    metricName: {
      type: String,
      trim: true,
      required: [true, "Metric name is required"]
    },
    affectedEntity: {
      type: String,
      trim: true,
      required: [true, "Affected entity is required"]
    },
    currentValue: {
      type: Number,
      required: [true, "Current value is required"]
    },
    previousValue: {
      type: Number,
      required: [true, "Previous value is required"]
    },
    changePercent: {
      type: Number,
      required: [true, "Change percent is required"]
    },
    direction: {
      type: String,
      enum: {
        values: ["increase", "decrease"],
        message: "Direction must be increase or decrease"
      },
      required: [true, "Direction is required"]
    },
    zScore: {
      type: Number
    },
    period: {
      type: String,
      trim: true,
      required: [true, "Period is required"]
    }
  },
  { _id: false }
);

const aiRecommendationSchema = new mongoose.Schema(
  {
    priority: {
      type: String,
      enum: {
        values: ["high", "medium", "low"],
        message: "Priority must be high, medium, or low"
      },
      required: [true, "Priority is required"]
    },
    category: {
      type: String,
      enum: {
        values: recommendationCategories,
        message: "Recommendation category is not supported"
      },
      required: [true, "Recommendation category is required"]
    },
    title: {
      type: String,
      trim: true,
      required: [true, "Recommendation title is required"]
    },
    description: {
      type: String,
      trim: true,
      required: [true, "Recommendation description is required"]
    },
    expectedImpact: {
      type: String,
      trim: true,
      required: [true, "Expected impact is required"]
    },
    actionSteps: {
      type: [String],
      default: [],
      validate: {
        validator(steps) {
          return steps.every((step) => typeof step === "string" && step.trim().length > 0);
        },
        message: "Action steps must contain non-empty strings"
      }
    },
    relatedFlags: {
      type: [String],
      default: [],
      validate: {
        validator(flags) {
          return flags.every((flag) => diagnosticFlagTypes.includes(flag));
        },
        message: "Related flags must reference valid diagnostic flag types"
      }
    }
  },
  { _id: false }
);

const scoreBreakdownSchema = new mongoose.Schema(
  {
    ctrScore: {
      ...numberRange(0, 25),
      default: 0
    },
    roasScore: {
      ...numberRange(0, 25),
      default: 0
    },
    conversionScore: {
      ...numberRange(0, 25),
      default: 0
    },
    impressionShareScore: {
      ...numberRange(0, 25),
      default: 0
    }
  },
  { _id: false }
);

const analysisJobSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      required: [true, "Queue job id is required"],
      unique: true,
      trim: true,
      validate: {
        validator(value) {
          return uuidPattern.test(value);
        },
        message: "Queue job id must be a valid UUID"
      }
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User id is required"],
      index: true
    },
    fileName: {
      type: String,
      required: [true, "File name is required"],
      trim: true
    },
    fileSize: {
      type: Number,
      min: [0, "File size cannot be negative"],
      validate: {
        validator(value) {
          return value === undefined || Number.isInteger(value);
        },
        message: "File size must be an integer number of bytes"
      }
    },
    status: {
      type: String,
      enum: {
        values: ["queued", "processing", "completed", "failed", "archived"],
        message: "Status must be queued, processing, completed, failed, or archived"
      },
      default: "queued",
      index: true
    },
    progress: {
      type: Number,
      min: [0, "Progress cannot be less than 0"],
      max: [100, "Progress cannot be greater than 100"],
      default: 0
    },
    errorMessage: {
      type: String,
      trim: true
    },
    rowCount: {
      type: Number,
      min: [0, "Row count cannot be negative"],
      validate: {
        validator(value) {
          return value === undefined || Number.isInteger(value);
        },
        message: "Row count must be an integer"
      }
    },
    campaignCount: {
      type: Number,
      min: [0, "Campaign count cannot be negative"],
      validate: {
        validator(value) {
          return value === undefined || Number.isInteger(value);
        },
        message: "Campaign count must be an integer"
      }
    },
    performanceScore: {
      type: Number,
      min: [0, "Performance score cannot be less than 0"],
      max: [100, "Performance score cannot be greater than 100"]
    },
    scoreBand: {
      type: String,
      enum: {
        values: ["Critical", "Poor", "Average", "Good", "Excellent"],
        message: "Score band is not supported"
      }
    },
    diagnostics: {
      type: [diagnosticFlagSchema],
      default: []
    },
    anomalies: {
      type: [anomalySchema],
      default: []
    },
    aiRecommendations: {
      type: [aiRecommendationSchema],
      default: []
    },
    scoreBreakdown: {
      type: scoreBreakdownSchema,
      default: () => ({})
    },
    processedAt: {
      type: Date
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

analysisJobSchema.index({ jobId: 1 }, { unique: true });
analysisJobSchema.index({ status: 1 });
analysisJobSchema.index({ userId: 1, createdAt: -1 });

analysisJobSchema.virtual("id").get(function getId() {
  return this._id.toHexString();
});

analysisJobSchema.virtual("isTerminal").get(function getIsTerminal() {
  return ["completed", "failed", "archived"].includes(this.status);
});

analysisJobSchema.virtual("durationMs").get(function getDurationMs() {
  if (!this.createdAt || !this.processedAt) {
    return null;
  }

  return this.processedAt.getTime() - this.createdAt.getTime();
});

analysisJobSchema.pre("validate", function setScoreBand(next) {
  if (typeof this.performanceScore === "number" && !this.scoreBand) {
    this.scoreBand = this.calculateScoreBand();
  }
  next();
});

analysisJobSchema.methods.calculateScoreBand = function calculateScoreBand() {
  const score = this.performanceScore;
  if (typeof score !== "number") {
    return undefined;
  }
  if (score < 40) return "Critical";
  if (score < 55) return "Poor";
  if (score < 70) return "Average";
  if (score < 85) return "Good";
  return "Excellent";
};

analysisJobSchema.methods.markProcessing = function markProcessing(progress = 0) {
  this.status = "processing";
  this.progress = progress;
  this.errorMessage = undefined;
  return this.save();
};

analysisJobSchema.methods.updateProgress = function updateProgress(progress) {
  this.progress = progress;
  return this.save();
};

analysisJobSchema.methods.markCompleted = function markCompleted(result = {}) {
  this.status = "completed";
  this.progress = 100;
  this.errorMessage = undefined;
  this.processedAt = new Date();

  if (typeof result.rowCount === "number") this.rowCount = result.rowCount;
  if (typeof result.campaignCount === "number") this.campaignCount = result.campaignCount;
  if (typeof result.performanceScore === "number") this.performanceScore = result.performanceScore;
  if (result.scoreBand) this.scoreBand = result.scoreBand;
  if (Array.isArray(result.diagnostics)) this.diagnostics = result.diagnostics;
  if (Array.isArray(result.anomalies)) this.anomalies = result.anomalies;
  if (Array.isArray(result.aiRecommendations)) this.aiRecommendations = result.aiRecommendations;
  if (result.scoreBreakdown) this.scoreBreakdown = result.scoreBreakdown;

  if (!this.scoreBand) {
    this.scoreBand = this.calculateScoreBand();
  }

  return this.save();
};

analysisJobSchema.methods.markFailed = function markFailed(error) {
  this.status = "failed";
  this.errorMessage = error instanceof Error ? error.message : String(error);
  this.processedAt = new Date();
  return this.save();
};

analysisJobSchema.statics.findByJobId = function findByJobId(jobId) {
  return this.findOne({ jobId });
};

analysisJobSchema.statics.findRecentByUser = function findRecentByUser(userId, limit = 20) {
  return this.find({ userId }).sort({ createdAt: -1 }).limit(limit);
};

export const AnalysisJob =
  mongoose.models.AnalysisJob || mongoose.model("AnalysisJob", analysisJobSchema);
export default AnalysisJob;
