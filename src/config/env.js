import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

const nodeEnv = process.env.NODE_ENV || "development";
const redisUrl = process.env.REDIS_URL || "";

if (nodeEnv === "production") {
  const requiredInProduction = ["JWT_SECRET", "MONGODB_URI"];
  const missing = requiredInProduction.filter((key) => !process.env[key]);
  if (!redisUrl) {
    missing.push("REDIS_URL");
  }
  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
}

export const config = {
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  mongodbUri: process.env.MONGODB_URI || "",
  redisUrl,
  port: Number(process.env.PORT || 5000),
  nodeEnv,
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  jwtSecret:
    process.env.JWT_SECRET ||
    "development-only-secret-change-before-deployment"
};
