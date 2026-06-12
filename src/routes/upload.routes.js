import path from "node:path";
import fs from "node:fs";
import { Router } from "express";
import { body } from "express-validator";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { uploadCsv } from "../controllers/upload.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

const uploadsDir = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, callback) => {
    callback(null, `${uuidv4()}-${Date.now()}.csv`);
  }
});

const csvFileFilter = (req, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (extension !== ".csv") {
    const error = new Error("Only CSV files are allowed.");
    error.statusCode = 400;
    error.code = "INVALID_FILE_TYPE";
    return callback(error);
  }

  return callback(null, true);
};

const upload = multer({
  storage,
  fileFilter: csvFileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

router.post(
  "/csv",
  authenticate,
  upload.single("file"),
  [
    body("file").custom((value, { req }) => {
      if (!req.file) {
        throw new Error("CSV file is required.");
      }

      return true;
    })
  ],
  uploadCsv
);

export default router;
