import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

userSchema.set("toJSON", {
  transform(doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  }
});

export const User = mongoose.models.User || mongoose.model("User", userSchema);

