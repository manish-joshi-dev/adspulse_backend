import { validationResult } from "express-validator";

export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    next(new ApiError(422, "Validation failed", errors.array()));
    return;
  }
  next();
};

export const notFoundHandler = (req, res, next) => {
  next(new ApiError(404, `Route ${req.originalUrl} was not found`));
};

export const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const statusCode = error.statusCode || error.status || 500;
  const code =
    error.code ||
    (statusCode === 401
      ? "UNAUTHORIZED"
      : statusCode === 403
        ? "FORBIDDEN"
        : statusCode === 404
          ? "NOT_FOUND"
          : statusCode === 422
            ? "VALIDATION_ERROR"
            : "REQUEST_ERROR");
  const payload = {
    success: false,
    error: {
      code,
      message: statusCode >= 500 ? "Unexpected server error" : error.message,
      details: error.details || null
    }
  };

  if (process.env.NODE_ENV !== "production") {
    payload.error.stack = error.stack;
  }

  res.status(statusCode).json(payload);
};
