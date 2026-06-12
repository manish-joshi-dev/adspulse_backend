import express from "express";
import morgan from "morgan";
import cors from "cors";
import { config } from "./src/config/env.js";
import { applySecurity } from "./src/config/security.config.js";
import { sanitizeInput } from "./src/middleware/validation.middleware.js";
import { uploadRateLimit, analysisRateLimit, authRateLimit } from "./src/middleware/rateLimit.middleware.js";
import { errorHandler } from "./src/middleware/errorHandler.middleware.js";
import apiRoutes from "./src/routes/index.js";

const app = express();

// 1. CORS — must be absolute first
app.use(cors({
  origin: [
    'https://adspulse-frontend.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests for all routes
app.options('*', cors());

// 2. Security, body parsing, sanitization, logging
applySecurity(app);
app.use(express.json({ limit: "2mb" }));
app.use(sanitizeInput);
app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));

// 3. Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "AdsPulse API",
    environment: config.nodeEnv,
    uptime: process.uptime()
  });
});

// 4. Rate limits — must be before route mounting
app.use("/api/auth", authRateLimit);
app.use("/api/upload", uploadRateLimit);
app.use("/api/analysis", analysisRateLimit);

// 5. Routes
app.use("/api", apiRoutes);

// 6. Global error handler — always last
app.use(errorHandler);

export default app;