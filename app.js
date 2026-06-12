import express from "express";
import morgan from "morgan";
import { config } from "./src/config/env.js";
import { applySecurity } from "./src/config/security.config.js";
import { sanitizeInput } from "./src/middleware/validation.middleware.js";
import { uploadRateLimit, analysisRateLimit, authRateLimit } from "./src/middleware/rateLimit.middleware.js";
import { errorHandler } from "./src/middleware/errorHandler.middleware.js";
import apiRoutes from "./src/routes/index.js"; // Import the consolidated router
import cors from "cors";

const app = express();

applySecurity(app);
app.use(express.json({ limit: "2mb" }));
app.use(sanitizeInput);
app.use(cors({
  origin: 'https://adspulse-frontend.vercel.app/', // your exact Vercel URL
  credentials: true,                    // needed if you're sending cookies/auth headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));



app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "AdsPulse API",
    environment: config.nodeEnv,
    uptime: process.uptime()
  });
});

// Mount consolidated API routes
app.use("/api", apiRoutes);

// Apply rate limits to specific sub-routes within apiRoutes if not already applied internally
// Note: This is a placeholder. Best practice is to apply rate limits directly in individual route files.
app.use("/api/auth", authRateLimit);
app.use("/api/upload", uploadRateLimit);
app.use("/api/analysis", analysisRateLimit);

app.use(errorHandler);

export default app;
