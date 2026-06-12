import { Router } from "express";
import { param } from "express-validator";
import {
  archiveAnalysis,
  getAnalysisHistory,
  getAnalysisResults,
  getAnalysisStatus
} from "../controllers/analysis.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

const jobIdParam = param("jobId")
  .isUUID()
  .withMessage("jobId must be a valid UUID.");

router.get("/status/:jobId", authenticate, jobIdParam, getAnalysisStatus);
router.get("/results/:jobId", authenticate, jobIdParam, getAnalysisResults);
router.get("/history", authenticate, getAnalysisHistory);
router.delete("/:jobId", authenticate, jobIdParam, archiveAnalysis);

export default router;
