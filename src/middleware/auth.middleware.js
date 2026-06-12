import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import User from "../models/User.model.js";

const errorResponse = (res, status, code, message, details = null) =>
  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      details
    }
  });

const readBearerToken = (req) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
};

export const authenticate = async (req, res, next) => {
  try {
    const token = readBearerToken(req);
    if (!token) {
      return errorResponse(res, 401, "AUTH_TOKEN_REQUIRED", "Authorization bearer token is required");
    }

    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.userId).select("-passwordHash");
    if (!user) {
      return errorResponse(res, 401, "AUTH_USER_NOT_FOUND", "Authenticated user was not found");
    }

    req.user = {
      userId: user.id,
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      plan: user.plan,
      analysisCount: user.analysisCount,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt
    };

    return next();
  } catch (error) {
    return errorResponse(res, 401, "AUTH_TOKEN_INVALID", "Authentication token is invalid or expired");
  }
};

export const optionalAuthenticate = async (req, res, next) => {
  const token = readBearerToken(req);
  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.userId).select("-passwordHash");
    if (user) {
      req.user = {
        userId: user.id,
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        plan: user.plan,
        analysisCount: user.analysisCount,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
      };
    }
    return next();
  } catch {
    return next();
  }
};

export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return errorResponse(res, 401, "AUTH_REQUIRED", "Authentication required");
  }

  if (req.user.role !== "admin") {
    return errorResponse(
      res,
      403,
      "FORBIDDEN",
      "This action requires administrator privileges"
    );
  }

  return next();
};
