import crypto from "crypto";
import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User id is required"],
      index: true
    },
    analysisJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AnalysisJob",
      required: [true, "Analysis job id is required"],
      index: true
    },
    title: {
      type: String,
      trim: true,
      maxlength: [180, "Title cannot exceed 180 characters"]
    },
    summary: {
      type: String,
      trim: true,
      maxlength: [5000, "Summary cannot exceed 5000 characters"]
    },
    generatedAt: {
      type: Date,
      default: Date.now
    },
    isPublic: {
      type: Boolean,
      default: false
    },
    shareToken: {
      type: String,
      unique: true,
      sparse: true,
      trim: true
    }
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

reportSchema.index({ shareToken: 1 }, { unique: true, sparse: true });
reportSchema.index({ userId: 1, generatedAt: -1 });
reportSchema.index({ analysisJobId: 1 });

reportSchema.virtual("id").get(function getId() {
  return this._id.toHexString();
});

reportSchema.virtual("shareUrl").get(function getShareUrl() {
  if (!this.isPublic || !this.shareToken) {
    return null;
  }

  return `/reports/public/${this.shareToken}`;
});

reportSchema.virtual("isShareable").get(function getIsShareable() {
  return Boolean(this.isPublic && this.shareToken);
});

reportSchema.methods.publish = function publish() {
  this.isPublic = true;
  if (!this.shareToken) {
    this.shareToken = crypto.randomBytes(24).toString("hex");
  }
  return this.save();
};

reportSchema.methods.unpublish = function unpublish() {
  this.isPublic = false;
  this.shareToken = undefined;
  return this.save();
};

reportSchema.methods.updateSummary = function updateSummary({ title, summary }) {
  if (title !== undefined) {
    this.title = title;
  }
  if (summary !== undefined) {
    this.summary = summary;
  }
  this.generatedAt = new Date();
  return this.save();
};

reportSchema.statics.findPublicByToken = function findPublicByToken(shareToken) {
  return this.findOne({
    shareToken,
    isPublic: true
  });
};

reportSchema.statics.findByUser = function findByUser(userId, limit = 20) {
  return this.find({ userId }).sort({ generatedAt: -1 }).limit(limit);
};

export const Report = mongoose.models.Report || mongoose.model("Report", reportSchema);
export default Report;

