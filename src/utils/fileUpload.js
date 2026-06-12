import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { ApiError } from "./http.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, "../../uploads");

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, uploadDir);
  },
  filename(req, file, callback) {
    const safeName = file.originalname.replace(/[^a-z0-9._-]/gi, "_").toLowerCase();
    callback(null, `${Date.now()}-${safeName}`);
  }
});

const csvFileFilter = (req, file, callback) => {
  const isCsv =
    file.mimetype === "text/csv" ||
    file.mimetype === "application/vnd.ms-excel" ||
    file.originalname.toLowerCase().endsWith(".csv");

  if (!isCsv) {
    callback(new ApiError(400, "Only CSV files are supported"));
    return;
  }

  callback(null, true);
};

export const csvUpload = multer({
  storage,
  fileFilter: csvFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  }
});

