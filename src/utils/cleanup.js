import fs from "fs/promises";

export const removeFile = async (filePath) => {
  if (!filePath) {
    return;
  }

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Unable to remove temporary file ${filePath}: ${error.message}`);
    }
  }
};

