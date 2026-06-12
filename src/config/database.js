import mongoose from "mongoose";
import { config } from "./env.js";

export const connectDatabase = async () => {
  if (!config.mongodbUri) {
    console.warn("MONGODB_URI is not set. Reports and users will use in-memory storage for this process.");
    return null;
  }

  mongoose.set("strictQuery", true);
  const connection = await mongoose.connect(config.mongodbUri, {
    serverSelectionTimeoutMS: 10000
  });
  console.log("MongoDB connected");
  return connection;
};

export const disconnectDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log("MongoDB disconnected");
  }
};

export const isDatabaseConnected = () => mongoose.connection.readyState === 1;

