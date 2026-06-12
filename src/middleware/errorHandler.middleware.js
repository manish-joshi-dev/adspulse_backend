import { config } from '../config/env.js';

export const errorHandler = (err, req, res, next) => {
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred';
  let details = null;

  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    details = Object.values(err.errors).map(e => ({ field: e.path, message: e.message }));
  } else if (err.statusCode && err.code) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
  } else if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_ID';
    message = 'The provided ID is invalid';
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = 'Authentication token is invalid or expired';
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    code = 'FILE_TOO_LARGE';
    message = 'File size exceeds the allowed limit (50MB)';
  } else if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_ENTRY';
    message = 'A record with this identifier already exists';
  }

  if (statusCode === 500) {
    console.error('Unhandled Error:', err);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: err.message || message,
      ...(details && { details }),
      ...(config.nodeEnv === 'development' && { stack: err.stack })
    }
  });
};
