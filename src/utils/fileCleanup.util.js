import fs from "fs/promises";
import path from "path";

export const deleteUploadedFile = async (filePath) => {
  if (!filePath) {
    return;
  }

  try {
    await fs.unlink(filePath);
    console.log(`Deleted uploaded file: ${filePath}`);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn(`Uploaded file already removed: ${filePath}`);
      return;
    }

    console.warn(`Unable to delete uploaded file ${filePath}: ${error.message}`);
  }
};

export const cleanupOldFiles = async (uploadsDir, maxAgeHours) => {
  if (!uploadsDir || !Number.isFinite(Number(maxAgeHours))) {
    return;
  }

  const maxAgeMs = Number(maxAgeHours) * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAgeMs;

  try {
    const entries = await fs.readdir(uploadsDir, { withFileTypes: true });

    await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const filePath = path.join(uploadsDir, entry.name);
          try {
            const stats = await fs.stat(filePath);
            if (stats.mtimeMs < cutoff) {
              await fs.unlink(filePath);
              console.log(`Deleted stale uploaded file: ${filePath}`);
            }
          } catch (error) {
            console.warn(`Unable to inspect or delete ${filePath}: ${error.message}`);
          }
        })
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn(`Uploads directory does not exist: ${uploadsDir}`);
      return;
    }

    console.warn(`Unable to clean uploads directory ${uploadsDir}: ${error.message}`);
  }
};

