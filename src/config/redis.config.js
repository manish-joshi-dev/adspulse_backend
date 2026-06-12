import Redis from "ioredis";
import { config } from "./env.js";

const validateRedisUrl = (redisUrl) => {
  if (!redisUrl) {
    throw new Error("REDIS_URL is required for BullMQ analysis queue.");
  }

  let parsed;
  try {
    parsed = new URL(redisUrl);
  } catch {
    throw new Error("REDIS_URL must be a valid Redis URL.");
  }

  if (parsed.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use the rediss:// scheme for Upstash Redis.");
  }

  if (!parsed.hostname.includes(".")) {
    throw new Error(
      `REDIS_URL hostname "${parsed.hostname}" is not a public Upstash host. Use the Upstash rediss:// endpoint.`
    );
  }

  if (!parsed.username || !parsed.password) {
    throw new Error("REDIS_URL must include Upstash username and password credentials.");
  }

  return redisUrl;
};

let validatedRedisUrl = "";

try {
  validatedRedisUrl = validateRedisUrl(config.redisUrl || process.env.REDIS_URL);
} catch (error) {
  console.error(error.message);
}

const redis = new Redis(validatedRedisUrl || "rediss://default:invalid@invalid.upstash.io:6379", {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  connectTimeout: 10000,
  tls: {
    rejectUnauthorized: false
  },
  retryStrategy(times) {
    return Math.min(times * 500, 5000);
  }
});

redis.on("connect", () => {
  console.log("Redis connection opened for BullMQ");
});

redis.on("ready", () => {
  console.log("Redis connection ready for BullMQ");
});

redis.on("reconnecting", (delay) => {
  console.warn(`Redis reconnecting in ${delay}ms`);
});

redis.on("error", (error) => {
  console.error(`Redis runtime error: ${error.message}`);
});

export const verifyRedisConnection = async () => {
  try {
    validateRedisUrl(config.redisUrl || process.env.REDIS_URL);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  try {
    if (redis.status === "wait") {
      await redis.connect();
    }
    await redis.ping();
    console.log("Redis startup connection verified for BullMQ");
    return redis;
  } catch (error) {
    console.error(`Unable to connect to Redis on startup: ${error.message}`);
    process.exit(1);
  }
};

export const disconnectRedisClient = async () => {
  if (!["end", "close"].includes(redis.status)) {
    await redis.quit();
  }
};

export default redis;
