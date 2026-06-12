import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const bcryptPattern = /^\$2[aby]\$\d{2}\$.{53}$/;

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator(value) {
          return emailPattern.test(value);
        },
        message: "Email must be a valid email address"
      }
    },
    passwordHash: {
      type: String,
      required: [true, "Password hash is required"],
      select: false
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"]
    },
    role: {
      type: String,
      enum: {
        values: ["advertiser", "admin"],
        message: "Role must be advertiser or admin"
      },
      default: "advertiser"
    },
    plan: {
      type: String,
      enum: {
        values: ["free", "pro"],
        message: "Plan must be free or pro"
      },
      default: "free"
    },
    analysisCount: {
      type: Number,
      default: 0,
      min: [0, "Analysis count cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Analysis count must be an integer"
      }
    },
    lastLogin: {
      type: Date
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, createdAt: -1 });

userSchema.virtual("id").get(function getId() {
  return this._id.toHexString();
});

userSchema.virtual("isAdmin").get(function getIsAdmin() {
  return this.role === "admin";
});

userSchema.virtual("canRunAnalysis").get(function getCanRunAnalysis() {
  return this.plan === "pro" || this.analysisCount < 5;
});

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("passwordHash")) {
    next();
    return;
  }

  if (bcryptPattern.test(this.passwordHash)) {
    next();
    return;
  }

  try {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  if (!this.passwordHash || !candidatePassword) {
    return false;
  }

  return bcrypt.compare(candidatePassword, this.passwordHash);
};

userSchema.methods.recordLogin = async function recordLogin() {
  this.lastLogin = new Date();
  return this.save();
};

userSchema.methods.incrementAnalysisCount = async function incrementAnalysisCount() {
  this.analysisCount += 1;
  return this.save();
};

userSchema.statics.findByEmail = function findByEmail(email) {
  return this.findOne({
    email: String(email || "")
      .toLowerCase()
      .trim()
  }).select("+passwordHash");
};

userSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  }
});

export const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
