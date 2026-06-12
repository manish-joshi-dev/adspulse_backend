import rateLimit from 'express-rate-limit';

export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, error: { code: 'TOO_MANY_UPLOADS', message: 'Rate limit exceeded. Max 10 uploads per hour.' } }
});

export const analysisRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many analysis checks.' } }
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: { code: 'AUTH_LIMIT_EXCEEDED', message: 'Too many login attempts. Please try again later.' } }
});
