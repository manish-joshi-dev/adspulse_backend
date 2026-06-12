import { Router } from "express";
import { body, param } from "express-validator";
import { generateReport, getReport, shareReport } from "../controllers/reports.controller.js";
import { authenticate, optionalAuthenticate } from "../middleware/auth.middleware.js";

const router = Router();

const reportIdParam = param("reportId")
  .isMongoId()
  .withMessage("reportId must be a valid MongoDB ObjectId.");

router.post(
  "/generate",
  authenticate,
  [
    body("jobId")
      .isUUID()
      .withMessage("jobId must be a valid analysis UUID."),
    body("title")
      .optional()
      .trim()
      .isLength({ min: 1, max: 180 })
      .withMessage("title must be between 1 and 180 characters.")
  ],
  generateReport
);

router.get("/:reportId", optionalAuthenticate, reportIdParam, getReport);
router.post("/:reportId/share", authenticate, reportIdParam, shareReport);

export default router;
